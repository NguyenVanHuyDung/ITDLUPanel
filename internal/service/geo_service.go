package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// GeoInfo contains geolocation information for an IP address.
type GeoInfo struct {
	IP            string `json:"ip"`
	Country      string `json:"country"`
	CountryCode  string `json:"country_code"`
	Region       string `json:"region"`
	City         string `json:"city"`
	ISP          string `json:"isp"`
	Org          string `json:"org"`
	AS           string `json:"as"`
	Latitude     float64 `json:"lat"`
	Longitude    float64 `json:"lon"`
	Timezone     string `json:"timezone"`
}

// GeoService provides IP geolocation lookup with caching.
type GeoService struct {
	client  *http.Client
	cache   map[string]*geoCacheEntry
	cacheMu sync.RWMutex
}

type geoCacheEntry struct {
	info      *GeoInfo
	expiresAt time.Time
}

const (
	geoCacheDuration = 24 * time.Hour
	geoAPIBatchSize  = 50
	geoAPIInterval   = 950 * time.Millisecond // Rate limit: 45 req/min
)

// NewGeoService creates a new GeoService.
func NewGeoService() *GeoService {
	return &GeoService{
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		cache: make(map[string]*geoCacheEntry),
	}
}

// Lookup returns geolocation info for a single IP address.
// Uses cache to avoid repeated API calls.
func (s *GeoService) Lookup(ip string) (*GeoInfo, error) {
	// Skip private/local IPs
	if ip == "" || isPrivateIP(ip) {
		return nil, nil
	}

	// Check cache first
	s.cacheMu.RLock()
	if entry, ok := s.cache[ip]; ok && time.Now().Before(entry.expiresAt) {
		s.cacheMu.RUnlock()
		return entry.info, nil
	}
	s.cacheMu.RUnlock()

	// Fetch from API
	info, err := s.fetchFromAPI(ip)
	if err != nil {
		logger.Warn().Err(err).Str("ip", ip).Msg("failed to lookup IP geolocation")
		return nil, err
	}

	// Cache the result
	s.cacheMu.Lock()
	s.cache[ip] = &geoCacheEntry{
		info:      info,
		expiresAt: time.Now().Add(geoCacheDuration),
	}
	s.cacheMu.Unlock()

	return info, nil
}

// LookupBatch returns geolocation info for multiple IPs.
// Efficiently batches requests to minimize API calls.
func (s *GeoService) LookupBatch(ips []string) (map[string]*GeoInfo, error) {
	result := make(map[string]*GeoInfo)
	var ipsToFetch []string

	// Check cache first
	s.cacheMu.RLock()
	for _, ip := range ips {
		if ip == "" || isPrivateIP(ip) {
			continue
		}
		if entry, ok := s.cache[ip]; ok && time.Now().Before(entry.expiresAt) {
			result[ip] = entry.info
		} else {
			ipsToFetch = append(ipsToFetch, ip)
		}
	}
	s.cacheMu.RUnlock()

	if len(ipsToFetch) == 0 {
		return result, nil
	}

	// Deduplicate
	seen := make(map[string]bool)
	var uniqueIPs []string
	for _, ip := range ipsToFetch {
		if !seen[ip] {
			seen[ip] = true
			uniqueIPs = append(uniqueIPs, ip)
		}
	}

	// Fetch in batches with rate limiting
	for i := 0; i < len(uniqueIPs); i += geoAPIBatchSize {
		end := i + geoAPIBatchSize
		if end > len(uniqueIPs) {
			end = len(uniqueIPs)
		}
		batch := uniqueIPs[i:end]
		infos, err := s.fetchBatchFromAPI(batch)
		if err != nil {
			logger.Warn().Err(err).Msg("failed to batch lookup IPs")
			continue
		}

		s.cacheMu.Lock()
		for ip, info := range infos {
			result[ip] = info
			s.cache[ip] = &geoCacheEntry{
				info:      info,
				expiresAt: time.Now().Add(geoCacheDuration),
			}
		}
		s.cacheMu.Unlock()

		// Rate limiting between batches
		if i+geoAPIBatchSize < len(uniqueIPs) {
			time.Sleep(geoAPIInterval)
		}
	}

	return result, nil
}

// fetchFromAPI fetches geolocation for a single IP using ip-api.com.
func (s *GeoService) fetchFromAPI(ip string) (*GeoInfo, error) {
	url := fmt.Sprintf("http://ip-api.com/json/%s?fields=status,country,countryCode,region,city,isp,org,as,lat,lon,timezone,query", ip)
	
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "ITDLUPanel/1.0")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	var result struct {
		Status       string  `json:"status"`
		Country      string  `json:"country"`
		CountryCode  string  `json:"countryCode"`
		Region       string  `json:"regionName"`
		City         string  `json:"city"`
		ISP          string  `json:"isp"`
		Org          string  `json:"org"`
		AS           string  `json:"as"`
		Latitude     float64 `json:"lat"`
		Longitude    float64 `json:"lon"`
		Timezone     string  `json:"timezone"`
		Query        string  `json:"query"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if result.Status != "success" {
		return nil, fmt.Errorf("lookup failed: %s", result.Status)
	}

	return &GeoInfo{
		IP:           result.Query,
		Country:      result.Country,
		CountryCode:  result.CountryCode,
		Region:       result.Region,
		City:         result.City,
		ISP:          result.ISP,
		Org:          result.Org,
		AS:           result.AS,
		Latitude:     result.Latitude,
		Longitude:    result.Longitude,
		Timezone:     result.Timezone,
	}, nil
}

// fetchBatchFromAPI fetches geolocation for multiple IPs using batch API.
// ip-api.com supports up to 100 IPs per batch request.
func (s *GeoService) fetchBatchFromAPI(ips []string) (map[string]*GeoInfo, error) {
	url := "http://ip-api.com/batch?fields=status,country,countryCode,regionName,city,isp,org,as,lat,lon,timezone,query"

	payload, err := json.Marshal(ips)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, url, strings.NewReader(string(payload)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "ITDLUPanel/1.0")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	var results []struct {
		Status       string  `json:"status"`
		Country      string  `json:"country"`
		CountryCode  string  `json:"countryCode"`
		Region       string  `json:"regionName"`
		City         string  `json:"city"`
		ISP          string  `json:"isp"`
		Org          string  `json:"org"`
		AS           string  `json:"as"`
		Latitude     float64 `json:"lat"`
		Longitude    float64 `json:"lon"`
		Timezone     string  `json:"timezone"`
		Query        string  `json:"query"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, err
	}

	result := make(map[string]*GeoInfo)
	for i, r := range results {
		if r.Status != "success" || i >= len(ips) {
			continue
		}
		result[ips[i]] = &GeoInfo{
			IP:           r.Query,
			Country:      r.Country,
			CountryCode:  r.CountryCode,
			Region:       r.Region,
			City:         r.City,
			ISP:          r.ISP,
			Org:          r.Org,
			AS:           r.AS,
			Latitude:     r.Latitude,
			Longitude:    r.Longitude,
			Timezone:     r.Timezone,
		}
	}

	return result, nil
}

// ClearCache clears the geolocation cache.
func (s *GeoService) ClearCache() {
	s.cacheMu.Lock()
	s.cache = make(map[string]*geoCacheEntry)
	s.cacheMu.Unlock()
}

// CacheSize returns the current cache size.
func (s *GeoService) CacheSize() int {
	s.cacheMu.RLock()
	defer s.cacheMu.RUnlock()
	return len(s.cache)
}

// isPrivateIP checks if an IP address is private/local.
func isPrivateIP(ip string) bool {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return true
	}

	// Check private ranges
	privateRanges := []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"127.0.0.0/8",
		"::1/128",
		"fc00::/7",
		"fe80::/10",
	}

	for _, cidr := range privateRanges {
		_, network, err := net.ParseCIDR(cidr)
		if err == nil && network.Contains(parsed) {
			return true
		}
	}

	return false
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
