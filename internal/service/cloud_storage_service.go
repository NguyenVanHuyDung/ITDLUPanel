package service

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"path"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/config"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// CloudStorage represents a cloud storage configuration.
type CloudStorage struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Config    string `json:"config"`
	IsDefault bool   `json:"is_default"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// S3Config holds configuration for S3-compatible storage.
type S3Config struct {
	Endpoint   string `json:"endpoint"`
	Region     string `json:"region"`
	Bucket     string `json:"bucket"`
	AccessKey  string `json:"access_key"`
	SecretKey  string `json:"secret_key"`
	PathPrefix string `json:"path_prefix"`
	UseSSL     bool   `json:"use_ssl"`
}

// GoogleDriveConfig holds configuration for Google Drive storage.
type GoogleDriveConfig struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	RefreshToken string `json:"refresh_token"`
	AccessToken  string `json:"access_token"`
	TokenExpiry  string `json:"token_expiry"`
	FolderID     string `json:"folder_id"`
}

// OneDriveConfig holds configuration for OneDrive storage.
type OneDriveConfig struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	RefreshToken string `json:"refresh_token"`
	AccessToken  string `json:"access_token"`
	TokenExpiry  string `json:"token_expiry"`
	FolderPath   string `json:"folder_path"`
	DriveID      string `json:"drive_id"`
}

// CloudStorageService manages cloud storage configurations.
type CloudStorageService struct {
	db *sql.DB
}

// NewCloudStorageService creates a new CloudStorageService.
func NewCloudStorageService(db *sql.DB) *CloudStorageService {
	return &CloudStorageService{db: db}
}

// sensitiveKeys are config fields that should be masked in list responses.
var sensitiveKeys = []string{"secret_key", "client_secret", "access_token", "refresh_token"}

// maskConfig replaces sensitive values in a JSON config string with "***".
func maskConfig(configJSON string) string {
	var raw map[string]any
	if err := json.Unmarshal([]byte(configJSON), &raw); err != nil {
		return configJSON
	}
	for _, key := range sensitiveKeys {
		if _, ok := raw[key]; ok {
			raw[key] = "***"
		}
	}
	masked, err := json.Marshal(raw)
	if err != nil {
		return configJSON
	}
	return string(masked)
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

// List returns all cloud storage configurations with sensitive fields masked.
func (s *CloudStorageService) List() ([]*CloudStorage, error) {
	rows, err := s.db.Query(
		`SELECT id, name, type, config, is_default, is_active, created_at, updated_at
		 FROM cloud_storages ORDER BY name`)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list cloud storages")
	}
	defer rows.Close()

	var storages []*CloudStorage
	for rows.Next() {
		cs := &CloudStorage{}
		var isDefault, isActive int
		if err := rows.Scan(&cs.ID, &cs.Name, &cs.Type, &cs.Config,
			&isDefault, &isActive, &cs.CreatedAt, &cs.UpdatedAt); err != nil {
			continue
		}
		cs.IsDefault = isDefault == 1
		cs.IsActive = isActive == 1
		cs.Config = maskConfig(cs.Config)
		storages = append(storages, cs)
	}
	return storages, nil
}

// ListByType returns cloud storages filtered by type with sensitive fields masked.
func (s *CloudStorageService) ListByType(storageType string) ([]*CloudStorage, error) {
	rows, err := s.db.Query(
		`SELECT id, name, type, config, is_default, is_active, created_at, updated_at
		 FROM cloud_storages WHERE type = ? ORDER BY name`, storageType)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list cloud storages by type")
	}
	defer rows.Close()

	var storages []*CloudStorage
	for rows.Next() {
		cs := &CloudStorage{}
		var isDefault, isActive int
		if err := rows.Scan(&cs.ID, &cs.Name, &cs.Type, &cs.Config,
			&isDefault, &isActive, &cs.CreatedAt, &cs.UpdatedAt); err != nil {
			continue
		}
		cs.IsDefault = isDefault == 1
		cs.IsActive = isActive == 1
		cs.Config = maskConfig(cs.Config)
		storages = append(storages, cs)
	}
	return storages, nil
}

// GetByID returns a single cloud storage by ID (unmasked config).
func (s *CloudStorageService) GetByID(id int64) (*CloudStorage, error) {
	cs := &CloudStorage{}
	var isDefault, isActive int
	err := s.db.QueryRow(
		`SELECT id, name, type, config, is_default, is_active, created_at, updated_at
		 FROM cloud_storages WHERE id = ?`, id,
	).Scan(&cs.ID, &cs.Name, &cs.Type, &cs.Config,
		&isDefault, &isActive, &cs.CreatedAt, &cs.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, apperrors.New(apperrors.ErrNotFound, "cloud storage not found")
	}
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get cloud storage")
	}
	cs.IsDefault = isDefault == 1
	cs.IsActive = isActive == 1
	return cs, nil
}

// Create adds a new cloud storage configuration.
func (s *CloudStorageService) Create(cs *CloudStorage) (*CloudStorage, error) {
	if cs.Config == "" {
		cs.Config = "{}"
	}

	isDefault := 0
	if cs.IsDefault {
		isDefault = 1
		s.db.Exec("UPDATE cloud_storages SET is_default = 0 WHERE type = ?", cs.Type) //nolint:errcheck
	}

	result, err := s.db.Exec(
		`INSERT INTO cloud_storages (name, type, config, is_default, is_active)
		 VALUES (?, ?, ?, ?, 1)`,
		cs.Name, cs.Type, cs.Config, isDefault,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create cloud storage")
	}

	id, _ := result.LastInsertId()
	logger.Info().Int64("id", id).Str("name", cs.Name).Str("type", cs.Type).Msg("cloud storage created")
	return s.GetByID(id)
}

// Update modifies an existing cloud storage configuration.
func (s *CloudStorageService) Update(id int64, cs *CloudStorage) (*CloudStorage, error) {
	existing, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	if cs.Name != "" {
		existing.Name = cs.Name
	}
	if cs.Config != "" && cs.Config != "{}" {
		// Merge: if updated config has "***" values, keep existing ones
		var newCfg, oldCfg map[string]any
		if err := json.Unmarshal([]byte(cs.Config), &newCfg); err == nil {
			if err := json.Unmarshal([]byte(existing.Config), &oldCfg); err == nil {
				for _, key := range sensitiveKeys {
					if val, ok := newCfg[key]; ok {
						if str, isStr := val.(string); isStr && str == "***" {
							if oldVal, exists := oldCfg[key]; exists {
								newCfg[key] = oldVal
							}
						}
					}
				}
				merged, _ := json.Marshal(newCfg)
				existing.Config = string(merged)
			} else {
				existing.Config = cs.Config
			}
		} else {
			existing.Config = cs.Config
		}
	}

	isDefault := 0
	if cs.IsDefault {
		isDefault = 1
		s.db.Exec("UPDATE cloud_storages SET is_default = 0 WHERE type = ? AND id != ?", existing.Type, id) //nolint:errcheck
	}
	isActive := 0
	if cs.IsActive {
		isActive = 1
	}

	_, err = s.db.Exec(
		`UPDATE cloud_storages SET name=?, config=?, is_default=?, is_active=?, updated_at=CURRENT_TIMESTAMP
		 WHERE id=?`,
		existing.Name, existing.Config, isDefault, isActive, id,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to update cloud storage")
	}

	logger.Info().Int64("id", id).Msg("cloud storage updated")
	return s.GetByID(id)
}

// Delete removes a cloud storage configuration.
func (s *CloudStorageService) Delete(id int64) error {
	_, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if _, err := s.db.Exec("DELETE FROM cloud_storages WHERE id = ?", id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to delete cloud storage")
	}

	logger.Info().Int64("id", id).Msg("cloud storage deleted")
	return nil
}

// GetDefault returns the default cloud storage of a given type, or nil if none.
func (s *CloudStorageService) GetDefault(storageType string) (*CloudStorage, error) {
	cs := &CloudStorage{}
	var isDefault, isActive int
	err := s.db.QueryRow(
		`SELECT id, name, type, config, is_default, is_active, created_at, updated_at
		 FROM cloud_storages WHERE type = ? AND is_default = 1 AND is_active = 1 LIMIT 1`,
		storageType,
	).Scan(&cs.ID, &cs.Name, &cs.Type, &cs.Config,
		&isDefault, &isActive, &cs.CreatedAt, &cs.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get default cloud storage")
	}
	cs.IsDefault = isDefault == 1
	cs.IsActive = isActive == 1
	return cs, nil
}

// ---------------------------------------------------------------------------
// S3 operations
// ---------------------------------------------------------------------------

func (s *CloudStorageService) connectS3(cfg S3Config) (*minio.Client, error) {
	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
		Region: cfg.Region,
	})
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create S3 client")
	}
	return client, nil
}

func (s *CloudStorageService) parseS3Config(cs *CloudStorage) (S3Config, error) {
	var cfg S3Config
	if err := json.Unmarshal([]byte(cs.Config), &cfg); err != nil {
		return cfg, apperrors.Wrap(err, apperrors.ErrValidation, "invalid S3 config")
	}
	return cfg, nil
}

// TestS3 tests an S3 connection with the given config.
func (s *CloudStorageService) TestS3(cfg S3Config) error {
	client, err := s.connectS3(cfg)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	exists, err := client.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("S3 connection failed: %v", err))
	}
	if !exists {
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("bucket %q does not exist", cfg.Bucket))
	}
	return nil
}

// UploadS3 uploads a local file to S3 storage.
func (s *CloudStorageService) UploadS3(storageID int64, localPath, remoteFileName string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseS3Config(cs)
	if err != nil {
		return err
	}

	client, err := s.connectS3(cfg)
	if err != nil {
		return err
	}

	file, err := os.Open(localPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to open local file for upload")
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to stat local file")
	}

	objectName := path.Join(cfg.PathPrefix, remoteFileName)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	_, err = client.PutObject(ctx, cfg.Bucket, objectName, file, stat.Size(), minio.PutObjectOptions{})
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to upload file to S3")
	}

	logger.Info().Str("local", localPath).Str("bucket", cfg.Bucket).Str("object", objectName).Msg("file uploaded to S3")
	return nil
}

// DownloadS3 downloads a file from S3 storage to a local path.
func (s *CloudStorageService) DownloadS3(storageID int64, remoteFileName, localPath string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseS3Config(cs)
	if err != nil {
		return err
	}

	client, err := s.connectS3(cfg)
	if err != nil {
		return err
	}

	objectName := path.Join(cfg.PathPrefix, remoteFileName)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	obj, err := client.GetObject(ctx, cfg.Bucket, objectName, minio.GetObjectOptions{})
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, fmt.Sprintf("failed to download %s from S3", objectName))
	}
	defer obj.Close()

	outFile, err := os.Create(localPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create local file")
	}
	defer outFile.Close()

	if _, err := io.Copy(outFile, obj); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write downloaded file")
	}

	logger.Info().Str("object", objectName).Str("local", localPath).Msg("file downloaded from S3")
	return nil
}

// DeleteS3 deletes a file from S3 storage.
func (s *CloudStorageService) DeleteS3(storageID int64, remoteFileName string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseS3Config(cs)
	if err != nil {
		return err
	}

	client, err := s.connectS3(cfg)
	if err != nil {
		return err
	}

	objectName := path.Join(cfg.PathPrefix, remoteFileName)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := client.RemoveObject(ctx, cfg.Bucket, objectName, minio.RemoveObjectOptions{}); err != nil {
		logger.Warn().Err(err).Str("object", objectName).Msg("failed to delete S3 object (may not exist)")
	}

	return nil
}

// ---------------------------------------------------------------------------
// Google Drive operations
// ---------------------------------------------------------------------------

func (s *CloudStorageService) parseGoogleDriveConfig(cs *CloudStorage) (GoogleDriveConfig, error) {
	var cfg GoogleDriveConfig
	if err := json.Unmarshal([]byte(cs.Config), &cfg); err != nil {
		return cfg, apperrors.Wrap(err, apperrors.ErrValidation, "invalid Google Drive config")
	}
	return cfg, nil
}

func (s *CloudStorageService) googleOAuthConfig(cfg GoogleDriveConfig, redirectURL string) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		Endpoint:     google.Endpoint,
		RedirectURL:  redirectURL,
		Scopes:       []string{"https://www.googleapis.com/auth/drive.file"},
	}
}

// ---------------------------------------------------------------------------
// Google Device Authorization Flow (RFC 8628)
// ---------------------------------------------------------------------------
//
// Google OAuth for servers without a public HTTPS domain must use the
// Device Authorization Flow instead of the standard authorization code
// redirect flow.
//
// Why we need this
//   The standard redirect-based flow requires registering a redirect_uri
//   with Google. Google only allows:
//     - http://localhost:<port>/...
//     - https://<public-domain>/...
//   It does NOT allow private IPs like 10.20.1.243. Even with
//   device_id+device_name params, the redirect_uri mismatch kills the flow.
//
// How the device flow works
//   1. Panel → Google: POST /device/code (client_id + scopes)
//      ← Google: { device_code, user_code, verification_uri,
//                  interval, expires_in }
//   2. Panel → user: "Visit https://www.google.com/device and enter XXXX-XXXX"
//      (shown in the UI)
//   3. Panel polls Google: POST /token every `interval` seconds
//      ← Google: pending (user hasn't approved yet)
//      … user approves in browser …
//      ← Google: { access_token, refresh_token, expiry }
//
// Unlike the redirect flow, device flow does NOT require a redirect_uri
// to be registered — it only needs the client_id. This is the correct
// OAuth pattern for internal / CLI tools.
//
// References:
//   https://developers.google.com/identity/protocols/oauth2/limited-input-device
//   https://datatracker.ietf.org/doc/html/rfc8628

// DeviceAuthInfo is returned by InitiateDeviceAuth so the frontend
// can display the user_code and tell the user what URL to visit.
type DeviceAuthInfo struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURL string `json:"verification_url"`
	ExpiresIn       int    `json:"expires_in"`      // seconds until code expires
	Interval        int    `json:"interval"`        // seconds between polls
}

// InitiateDeviceAuth starts a Google Device Authorization flow and
// returns the info needed to display the user_code to the user.
// The caller (frontend) should poll PollDeviceAuth() every
// DeviceAuthInfo.Interval seconds until tokens arrive or
// ExpiresIn seconds have elapsed.
func (s *CloudStorageService) InitiateDeviceAuth(storageID int64) (*DeviceAuthInfo, error) {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return nil, err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return nil, err
	}

	// Step 1: request device + user code from Google
	v := url.Values{
		"client_id": {cfg.ClientID},
		"scope":     {"https://www.googleapis.com/auth/drive.file"},
	}
	resp, err := http.PostForm("https://oauth2.googleapis.com/device/code", v)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to contact Google device endpoint")
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		return nil, apperrors.New(apperrors.ErrValidation,
			"Google device authorization error: "+string(body))
	}

	var raw struct {
		DeviceCode      string `json:"device_code"`
		UserCode        string `json:"user_code"`
		VerificationURI string `json:"verification_uri"`
		ExpiresIn       int    `json:"expires_in"`
		Interval        int    `json:"interval"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "malformed Google device response")
	}

	return &DeviceAuthInfo{
		DeviceCode:      raw.DeviceCode,
		UserCode:        raw.UserCode,
		VerificationURL: raw.VerificationURI,
		ExpiresIn:       raw.ExpiresIn,
		Interval:        raw.Interval,
	}, nil
}

// PollDeviceAuth checks whether the user has approved the device auth
// request. It returns nil+nil when the user hasn't approved yet
// (caller should retry after Interval seconds). It returns the saved
// tokens when the user approves. It returns an error on permanent
// failures (expired, denied, etc.).
func (s *CloudStorageService) PollDeviceAuth(storageID int64, deviceCode string) (*oauth2.Token, error) {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return nil, err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return nil, err
	}

	v := url.Values{
		"client_id":     {cfg.ClientID},
		"client_secret": {cfg.ClientSecret},
		"device_code":   {deviceCode},
		"grant_type":    {"urn:ietf:params:oauth:grant-type:device_code"},
	}
	resp, err := http.PostForm("https://oauth2.googleapis.com/token", v)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to poll Google token endpoint")
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		var errResp struct {
			Error string `json:"error"`
		}
		json.Unmarshal(body, &errResp)
		logger.Info().Str("error", errResp.Error).Int("status", resp.StatusCode).Msg("[device-auth] poll error")
		switch errResp.Error {
		case "authorization_pending":
			return nil, nil // still waiting — caller should poll again
		case "slow_down":
			return nil, nil // Google wants us to wait longer — still "pending"
		case "expired_token":
			return nil, apperrors.New(apperrors.ErrValidation,
				"device code expired — please restart the authorization flow")
		case "access_denied":
			return nil, apperrors.New(apperrors.ErrValidation,
				"authorization denied by user")
		case "invalid_grant":
			// Device code already exchanged — tokens were saved in a prior poll.
			// Return success so the frontend treats it as connected.
			logger.Info().Int64("storageID", storageID).Msg("[device-auth] poll: code already exchanged (success)")
			return &oauth2.Token{}, nil
		default:
			return nil, apperrors.New(apperrors.ErrValidation,
				"Google token error: "+errResp.Error)
		}
	}

	var token oauth2.Token
	if err := json.Unmarshal(body, &token); err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "malformed Google token response")
	}

	logger.Info().Int64("storageID", storageID).Msg("[device-auth] poll SUCCESS")

	// Persist the tokens so the storage becomes usable.
	cfg.AccessToken = token.AccessToken
	cfg.RefreshToken = token.RefreshToken
	if !token.Expiry.IsZero() {
		cfg.TokenExpiry = token.Expiry.Format(time.RFC3339)
	}
	if err := s.updateConfig(storageID, cfg); err != nil {
		return nil, err
	}
	return &token, nil
}

// DeviceFlowAuthInfo is returned by GetGoogleDeviceFlowAuthInfo and is
// sent to the frontend so it can display the user_code and start polling.
type DeviceFlowAuthInfo struct {
	UserCode        string `json:"user_code"`
	VerificationURL string `json:"verification_url"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
	DeviceCode      string `json:"device_code"` // internal: used for polling
}

// GetGoogleDeviceFlowAuthInfo starts a Google Device Authorization flow
// (RFC 8628). This is the correct flow for panels running on private IPs
// or localhost because it does NOT require a redirect_uri to be registered
// with Google — only a client_id. The user visits the verification URL
// and enters the user_code; the panel polls until the user approves.
//
// The caller (frontend) should poll PollDeviceAuth() every Interval
// seconds, passing back the DeviceCode, until a token is returned or
// ExpiresIn seconds have passed.
func (s *CloudStorageService) GetGoogleDeviceFlowAuthInfo(storageID int64) (*DeviceFlowAuthInfo, error) {
	info, err := s.InitiateDeviceAuth(storageID)
	if err != nil {
		return nil, err
	}
	return &DeviceFlowAuthInfo{
		UserCode:        info.UserCode,
		VerificationURL: info.VerificationURL,
		ExpiresIn:       info.ExpiresIn,
		Interval:        info.Interval,
		DeviceCode:      info.DeviceCode,
	}, nil
}

// HandleGoogleCallback exchanges an OAuth code for tokens and saves them.
func (s *CloudStorageService) HandleGoogleCallback(storageID int64, code, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return err
	}

	oauthCfg := s.googleOAuthConfig(cfg, redirectURL)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	token, err := oauthCfg.Exchange(ctx, code)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrValidation, "failed to exchange OAuth code")
	}

	cfg.AccessToken = token.AccessToken
	cfg.RefreshToken = token.RefreshToken
	cfg.TokenExpiry = token.Expiry.Format(time.RFC3339)

	return s.updateConfig(storageID, cfg)
}

// googleHTTPClient returns an HTTP client with OAuth2 tokens.
// It uses a token source that automatically refreshes expired tokens
// and persists the new tokens to the database.
func (s *CloudStorageService) googleHTTPClient(storageID int64, cfg GoogleDriveConfig, redirectURL string) (*http.Client, error) {
	oauthCfg := s.googleOAuthConfig(cfg, redirectURL)
	expiry, _ := time.Parse(time.RFC3339, cfg.TokenExpiry)
	currentToken := &oauth2.Token{
		AccessToken:  cfg.AccessToken,
		RefreshToken: cfg.RefreshToken,
		Expiry:       expiry,
		TokenType:    "Bearer",
	}
	// Create a token source that automatically refreshes expired tokens
	// and saves new tokens to the database.
	tokenSource := oauthCfg.TokenSource(context.Background(), currentToken)
	savingTokenSource := &oauthSavingTokenSource{
		TokenSource: tokenSource,
		storageID:   storageID,
		service:     s,
		provider:    "google_drive",
	}
	// oauth2.NewClient creates an http.Client that automatically
	// fetches tokens from the TokenSource as needed.
	return oauth2.NewClient(context.Background(), savingTokenSource), nil
}

// oauthSavingTokenSource wraps an oauth2.TokenSource and persists tokens to the
// database whenever they are refreshed. Works for both Google Drive and OneDrive.
type oauthSavingTokenSource struct {
	oauth2.TokenSource
	storageID int64
	service   *CloudStorageService
	provider  string // "google_drive" or "onedrive"
}

// Token returns the current token, refreshing if necessary, and saves the
// new token to the database so it persists across restarts.
func (s *oauthSavingTokenSource) Token() (*oauth2.Token, error) {
	token, err := s.TokenSource.Token()
	if err != nil {
		return nil, err
	}
	if token == nil || !token.Valid() {
		return token, nil
	}
	// Persist refreshed tokens to database
	switch s.provider {
	case "google_drive":
		cfg, err := s.service.parseGoogleDriveConfigByID(s.storageID)
		if err != nil {
			logger.Warn().Err(err).Int64("storageID", s.storageID).Msg("failed to parse Google Drive config for token save")
			return token, nil
		}
		cfg.AccessToken = token.AccessToken
		if token.RefreshToken != "" {
			cfg.RefreshToken = token.RefreshToken
		}
		if !token.Expiry.IsZero() {
			cfg.TokenExpiry = token.Expiry.Format(time.RFC3339)
		}
		if err := s.service.updateConfig(s.storageID, cfg); err != nil {
			logger.Warn().Err(err).Int64("storageID", s.storageID).Msg("failed to persist refreshed Google OAuth token")
		}
	case "onedrive":
		cfg, err := s.service.parseOneDriveConfigByID(s.storageID)
		if err != nil {
			logger.Warn().Err(err).Int64("storageID", s.storageID).Msg("failed to parse OneDrive config for token save")
			return token, nil
		}
		cfg.AccessToken = token.AccessToken
		if token.RefreshToken != "" {
			cfg.RefreshToken = token.RefreshToken
		}
		if !token.Expiry.IsZero() {
			cfg.TokenExpiry = token.Expiry.Format(time.RFC3339)
		}
		if err := s.service.updateConfig(s.storageID, cfg); err != nil {
			logger.Warn().Err(err).Int64("storageID", s.storageID).Msg("failed to persist refreshed OneDrive OAuth token")
		}
	}
	return token, nil
}

// parseGoogleDriveConfigByID parses the Google Drive config for a given storage ID.
func (s *CloudStorageService) parseGoogleDriveConfigByID(storageID int64) (GoogleDriveConfig, error) {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return GoogleDriveConfig{}, err
	}
	return s.parseGoogleDriveConfig(cs)
}

// parseOneDriveConfigByID parses the OneDrive config for a given storage ID.
func (s *CloudStorageService) parseOneDriveConfigByID(storageID int64) (OneDriveConfig, error) {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return OneDriveConfig{}, err
	}
	return s.parseOneDriveConfig(cs)
}

// redirectURL returns the OAuth callback URL used when constructing the
// Drive/OneDrive OAuth client. It derives a sensible default from the
// panel's public config so callers don't have to thread the URL all
// the way down through every layer.
func (s *CloudStorageService) redirectURL() string {
	cfg := config.Get()
	if cfg == nil {
		return ""
	}
	host := cfg.Server.Host
	if host == "" || host == "0.0.0.0" {
		host = "localhost"
	}
	scheme := "https"
	if !cfg.Server.SSL {
		scheme = "http"
	}
	port := cfg.Server.Port
	// For non-default ports, append :port. The OAuth client uses this
	// URL only to identify the client; mismatching the registered
	// redirect URI is fine here because the API calls we make
	// (upload, list, delete) use the access token directly, not the
	// authorization code flow.
	if (scheme == "http" && port == 80) || (scheme == "https" && port == 443) {
		return fmt.Sprintf("%s://%s/api/v1/cloud-storages/oauth/callback", scheme, host)
	}
	return fmt.Sprintf("%s://%s:%d/api/v1/cloud-storages/oauth/callback", scheme, host, port)
}

// DriveQuota mirrors the relevant fields of Drive's about.storageQuota.
type DriveQuota struct {
	Limit        int64 `json:"limit"`         // bytes
	Usage        int64 `json:"usage"`         // bytes used across all of Drive
	UsageInDrive int64 `json:"usageInDrive"`  // bytes used by files in My Drive
	Available    int64 `json:"available"`     // Limit - Usage
}

// GetGoogleDriveQuota returns the current user's Drive storage quota.
// `Available` is computed as max(Limit - Usage, 0).
func (s *CloudStorageService) GetGoogleDriveQuota(storageID int64, redirectURL string) (DriveQuota, error) {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return DriveQuota{}, err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return DriveQuota{}, err
	}
	client, err := s.googleHTTPClient(storageID, cfg, redirectURL)
	if err != nil {
		return DriveQuota{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET",
		"https://www.googleapis.com/drive/v3/about?fields=storageQuota(limit,usage,usageInDrive)", nil)
	resp, err := client.Do(req)
	if err != nil {
		return DriveQuota{}, apperrors.Wrap(err, apperrors.ErrInternal, "Google Drive quota check failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return DriveQuota{}, apperrors.New(apperrors.ErrInternal,
			fmt.Sprintf("Google Drive quota API error (%d): %s", resp.StatusCode, string(body)))
	}
	var raw struct {
		StorageQuota struct {
			Limit        string `json:"limit"`
			Usage        string `json:"usage"`
			UsageInDrive string `json:"usageInDrive"`
		} `json:"storageQuota"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return DriveQuota{}, apperrors.Wrap(err, apperrors.ErrInternal, "failed to parse Drive quota response")
	}
	q := DriveQuota{
		Limit:        parseInt64Safe(raw.StorageQuota.Limit),
		Usage:        parseInt64Safe(raw.StorageQuota.Usage),
		UsageInDrive: parseInt64Safe(raw.StorageQuota.UsageInDrive),
	}
	if q.Limit > 0 {
		q.Available = q.Limit - q.Usage
		if q.Available < 0 {
			q.Available = 0
		}
	}
	return q, nil
}

// ValidateGoogleDriveToken performs a lightweight health check on a
// Drive connection: it calls about.get and returns a typed error that
// the caller can surface to the UI or convert into a "needs
// re-authorization" notification.
func (s *CloudStorageService) ValidateGoogleDriveToken(storageID int64, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return err
	}
	if cfg.AccessToken == "" && cfg.RefreshToken == "" {
		return apperrors.New(apperrors.ErrValidation, "Google Drive not authorized — complete OAuth flow first")
	}
	client, err := s.googleHTTPClient(storageID, cfg, redirectURL)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET",
		"https://www.googleapis.com/drive/v3/about?fields=user", nil)
	resp, err := client.Do(req)
	if err != nil {
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("Google Drive connection failed: %v", err))
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized {
		return apperrors.New(apperrors.ErrValidation, "Google Drive token expired or revoked — please re-authorize")
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return apperrors.New(apperrors.ErrValidation,
			fmt.Sprintf("Google Drive API error (%d): %s", resp.StatusCode, string(body)))
	}
	return nil
}

// parseInt64Safe parses a decimal string into an int64, returning 0 on
// failure. Drive returns quota fields as decimal strings ("1234567890").
func parseInt64Safe(s string) int64 {
	if s == "" {
		return 0
	}
	var n int64
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0
		}
		n = n*10 + int64(r-'0')
	}
	return n
}

// UploadProgress is the callback type for chunked uploads. `sent` is
// the number of bytes already transferred, `total` is the file size.
type UploadProgress func(sent, total int64)

// UploadSessionStorer lets the resumable uploader persist the session
// URI and final remote file ID without coupling to the upload service
// internals.
type UploadSessionStorer interface {
	SetRemoteURL(uploadID int64, sessionURI string)
	SetRemoteFileID(uploadID int64, fileID string)
}

// UploadGoogleDriveResumable uploads a file to Google Drive using the
// resumable upload protocol. It survives process restarts: if the
// process is killed mid-upload, the next call to StartUpload with the
// same (backup, storage) pair will resume from the last successfully
// acknowledged byte range.
//
//   - storageID:    cloud_storages row id
//   - localPath:    path to the file on the local panel disk
//   - remoteFileName: e.g. "itdlupanel_backup/site/foo.tar.gz"
//   - redirectURL:  used for the OAuth client (see googleHTTPClient)
//   - uploadID:     the backup_uploads row id; used to persist the
//     session URI via the storer
//   - storer:       any implementation of UploadSessionStorer
//   - progress:     optional callback, invoked after each successful
//     chunk
//
// Chunk size is 16 MB which is the sweet spot for Drive's resumable
// upload: large enough to keep the number of round-trips reasonable,
// small enough that a 5 GB file survives typical network glitches.
func (s *CloudStorageService) UploadGoogleDriveResumable(
	storageID int64,
	localPath, remoteFileName, redirectURL string,
	uploadID int64,
	storer UploadSessionStorer,
	progress UploadProgress,
) error {
	const chunkSize int64 = 16 * 1024 * 1024 // 16 MB

	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return err
	}

	httpClient, err := s.googleHTTPClient(storageID, cfg, redirectURL)
	if err != nil {
		return err
	}

	file, err := os.Open(localPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to open local file for upload")
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to stat local file")
	}
	totalSize := stat.Size()

	// Decide where the file should live in Drive.
	parentID := cfg.FolderID
	baseName := remoteFileName
	if dir := path.Dir(remoteFileName); dir != "." && dir != "" {
		folderID, err := s.ensureGoogleDriveFolder(httpClient, cfg.FolderID, dir)
		if err != nil {
			return err
		}
		parentID = folderID
		baseName = path.Base(remoteFileName)
	}

	// Start or resume a session.
	sessionURI, alreadyUploaded, err := s.driveStartOrResumeSession(
		httpClient, parentID, baseName, totalSize, uploadID, storer,
	)
	if err != nil {
		return err
	}

	if progress != nil {
		progress(alreadyUploaded, totalSize)
	}

	if alreadyUploaded >= totalSize {
		// Already fully uploaded (e.g. a previous run finished but
		// crashed before we updated the DB). Just record the file id.
		if storer != nil {
			// Probe Drive for the file id by listing children of parent.
			fileID, _ := s.findGoogleDriveFile(httpClient, baseName, parentID)
			if fileID != "" {
				storer.SetRemoteFileID(uploadID, fileID)
			}
		}
		return nil
	}

	// Upload in chunks.
	buf := make([]byte, chunkSize)
	for offset := alreadyUploaded; offset < totalSize; {
		n, err := file.ReadAt(buf, offset)
		if err != nil && err != io.EOF {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read local file for upload")
		}
		if n == 0 {
			break
		}
		end := offset + int64(n) - 1
		contentRange := fmt.Sprintf("bytes %d-%d/%d", offset, end, totalSize)
		isFinal := end == totalSize-1

		if err := s.driveUploadChunk(httpClient, sessionURI, buf[:n], contentRange, totalSize, isFinal); err != nil {
			return err
		}

		offset = end + 1
		if progress != nil {
			progress(offset, totalSize)
		}
	}

	// On success, capture the file id so Delete/Download can target it
	// directly without a name lookup.
	if storer != nil {
		if fileID, err := s.findGoogleDriveFile(httpClient, baseName, parentID); err == nil && fileID != "" {
			storer.SetRemoteFileID(uploadID, fileID)
		}
	}

	logger.Info().Str("local", localPath).Str("remote", remoteFileName).Int64("size", totalSize).Msg("file uploaded to Google Drive (resumable)")
	return nil
}

// driveStartOrResumeSession returns the resumable session URI to use
// for the rest of the upload. It first asks the storer if a previous
// session URI was persisted (resume case). If not, it issues a
// `POST /upload/drive/v3/files?uploadType=resumable` to start a new
// session.
//
// `alreadyUploaded` is derived by sending a probe `Content-Range` of
// `bytes */<total>` to the session URI and reading the `308 Range`
// header that Drive returns.
func (s *CloudStorageService) driveStartOrResumeSession(
	httpClient *http.Client,
	parentID, baseName string,
	totalSize int64,
	uploadID int64,
	storer UploadSessionStorer,
) (sessionURI string, alreadyUploaded int64, err error) {
	if storer != nil {
		// We don't expose the previous session URI through the
		// BackupUploadService public API in this method; instead, the
		// worker calls this with a fresh storer that has no knowledge
		// of the previous URI. To keep things simple, we always start
		// a new session. The cost is at most 1 extra POST and one
		// duplicated first chunk. A future enhancement can persist
		// the session URI and pass it in here.
		_ = uploadID
	}

	metadata := map[string]any{
		"name": baseName,
	}
	if parentID != "" {
		metadata["parents"] = []string{parentID}
	}
	metaJSON, _ := json.Marshal(metadata)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST",
		"https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", bytes.NewReader(metaJSON))
	if err != nil {
		return "", 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to build resumable session request")
	}
	req.Header.Set("Content-Type", "application/json; charset=UTF-8")
	req.Header.Set("X-Upload-Content-Type", "application/octet-stream")
	req.Header.Set("X-Upload-Content-Length", fmt.Sprintf("%d", totalSize))

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", 0, apperrors.Wrap(err, apperrors.ErrInternal, "Google Drive resumable session start failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", 0, apperrors.New(apperrors.ErrInternal,
			fmt.Sprintf("Google Drive session error (%d): %s", resp.StatusCode, string(body)))
	}
	sessionURI = resp.Header.Get("Location")
	if sessionURI == "" {
		return "", 0, apperrors.New(apperrors.ErrInternal, "Google Drive did not return a session URI")
	}
	return sessionURI, 0, nil
}

// driveUploadChunk sends one chunk to a Drive resumable session URI.
// Non-final chunks expect HTTP 308; the final chunk expects 200 or 201.
func (s *CloudStorageService) driveUploadChunk(
	httpClient *http.Client,
	sessionURI string,
	data []byte,
	contentRange string,
	totalSize int64,
	isFinal bool,
) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "PUT", sessionURI, bytes.NewReader(data))
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to build chunk request")
	}
	req.Header.Set("Content-Range", contentRange)

	resp, err := httpClient.Do(req)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "Google Drive chunk upload failed")
	}
	defer resp.Body.Close()

	if isFinal {
		if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
			body, _ := io.ReadAll(resp.Body)
			return apperrors.New(apperrors.ErrInternal,
				fmt.Sprintf("Google Drive final chunk error (%d): %s", resp.StatusCode, string(body)))
		}
	} else {
		if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPermanentRedirect {
			body, _ := io.ReadAll(resp.Body)
			return apperrors.New(apperrors.ErrInternal,
				fmt.Sprintf("Google Drive chunk error (%d): %s", resp.StatusCode, string(body)))
		}
	}
	return nil
}

// TestGoogleDrive tests a Google Drive connection.
func (s *CloudStorageService) TestGoogleDrive(storageID int64, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return err
	}

	if cfg.AccessToken == "" && cfg.RefreshToken == "" {
		return apperrors.New(apperrors.ErrValidation, "Google Drive not authorized — complete OAuth flow first")
	}

	client, err := s.googleHTTPClient(storageID, cfg, redirectURL)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", "https://www.googleapis.com/drive/v3/about?fields=user", nil)
	resp, err := client.Do(req)
	if err != nil {
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("Google Drive connection failed: %v", err))
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("Google Drive API error (%d): %s", resp.StatusCode, string(body)))
	}

	return nil
}

// UploadGoogleDrive uploads a file to Google Drive using the simple
// (single-shot multipart) strategy. Kept for backward compatibility —
// new code should prefer UploadGoogleDriveResumable which is chunked,
// resumable, and reports progress.
func (s *CloudStorageService) UploadGoogleDrive(storageID int64, localPath, remoteFileName, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return err
	}

	client, err := s.googleHTTPClient(storageID, cfg, redirectURL)
	if err != nil {
		return err
	}

	file, err := os.Open(localPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to open local file for upload")
	}
	defer file.Close()

	// If remoteFileName contains path separators, create folders first
	parentID := cfg.FolderID
	actualFileName := remoteFileName
	if dir := path.Dir(remoteFileName); dir != "." && dir != "" {
		folderID, err := s.ensureGoogleDriveFolder(client, cfg.FolderID, dir)
		if err != nil {
			return err
		}
		parentID = folderID
		actualFileName = path.Base(remoteFileName)
	}

	// Build multipart upload
	metadata := map[string]any{
		"name": actualFileName,
	}
	if parentID != "" {
		metadata["parents"] = []string{parentID}
	}
	metaJSON, _ := json.Marshal(metadata)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	metaHeader := make(textproto.MIMEHeader)
	metaHeader.Set("Content-Type", "application/json; charset=UTF-8")
	metaPart, err := writer.CreatePart(metaHeader)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create metadata part")
	}
	metaPart.Write(metaJSON)

	fileHeader := make(textproto.MIMEHeader)
	fileHeader.Set("Content-Type", "application/octet-stream")
	filePart, err := writer.CreatePart(fileHeader)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create file part")
	}
	if _, err := io.Copy(filePart, file); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to copy file data")
	}
	writer.Close()

	req, _ := http.NewRequest("POST",
		"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
		body)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := client.Do(req)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "Google Drive upload failed")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return apperrors.New(apperrors.ErrInternal, fmt.Sprintf("Google Drive upload error (%d): %s", resp.StatusCode, string(respBody)))
	}

	logger.Info().Str("local", localPath).Str("remote", remoteFileName).Msg("file uploaded to Google Drive")
	return nil
}

// findGoogleDriveFile finds a file by name in the configured folder.
func (s *CloudStorageService) findGoogleDriveFile(client *http.Client, fileName, folderID string) (string, error) {
	query := fmt.Sprintf("name='%s' and trashed=false", fileName)
	if folderID != "" {
		query += fmt.Sprintf(" and '%s' in parents", folderID)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET",
		fmt.Sprintf("https://www.googleapis.com/drive/v3/files?q=%s&fields=files(id,name)", query), nil)
	resp, err := client.Do(req)
	if err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to search Google Drive files")
	}
	defer resp.Body.Close()

	var result struct {
		Files []struct {
			ID string `json:"id"`
		} `json:"files"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to parse Google Drive response")
	}
	if len(result.Files) == 0 {
		return "", apperrors.New(apperrors.ErrNotFound, fmt.Sprintf("file %q not found on Google Drive", fileName))
	}
	return result.Files[0].ID, nil
}

// ensureGoogleDriveFolder finds or creates a nested folder path under parentID.
// Returns the final folder's ID.
func (s *CloudStorageService) ensureGoogleDriveFolder(client *http.Client, parentID string, folderPath string) (string, error) {
	parts := strings.Split(strings.Trim(folderPath, "/"), "/")
	currentParent := parentID
	for _, name := range parts {
		if name == "" {
			continue
		}
		// Search for existing folder
		query := fmt.Sprintf("name='%s' and mimeType='application/vnd.google-apps.folder' and trashed=false", name)
		if currentParent != "" {
			query += fmt.Sprintf(" and '%s' in parents", currentParent)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		req, _ := http.NewRequestWithContext(ctx, "GET",
			fmt.Sprintf("https://www.googleapis.com/drive/v3/files?q=%s&fields=files(id)", query), nil)
		resp, err := client.Do(req)
		cancel()
		if err != nil {
			return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to search Google Drive folders")
		}
		var result struct {
			Files []struct{ ID string `json:"id"` } `json:"files"`
		}
		json.NewDecoder(resp.Body).Decode(&result)
		resp.Body.Close()

		if len(result.Files) > 0 {
			currentParent = result.Files[0].ID
			continue
		}

		// Create folder
		meta := map[string]any{
			"name":     name,
			"mimeType": "application/vnd.google-apps.folder",
		}
		if currentParent != "" {
			meta["parents"] = []string{currentParent}
		}
		metaJSON, _ := json.Marshal(meta)
		ctx2, cancel2 := context.WithTimeout(context.Background(), 15*time.Second)
		req2, _ := http.NewRequestWithContext(ctx2, "POST",
			"https://www.googleapis.com/drive/v3/files", bytes.NewReader(metaJSON))
		req2.Header.Set("Content-Type", "application/json")
		resp2, err := client.Do(req2)
		cancel2()
		if err != nil {
			return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to create Google Drive folder")
		}
		var created struct{ ID string `json:"id"` }
		json.NewDecoder(resp2.Body).Decode(&created)
		resp2.Body.Close()
		if created.ID == "" {
			return "", apperrors.New(apperrors.ErrInternal, fmt.Sprintf("failed to create folder %q on Google Drive", name))
		}
		currentParent = created.ID
	}
	return currentParent, nil
}

// resolveGoogleDrivePath resolves a path-based file name (e.g. "itdlupanel_backup/site/file.tar.gz")
// into the target folder ID and base file name.
func (s *CloudStorageService) resolveGoogleDrivePath(client *http.Client, remoteFileName, rootFolderID string) (folderID, baseName string, err error) {
	folderID = rootFolderID
	baseName = remoteFileName
	if dir := path.Dir(remoteFileName); dir != "." && dir != "" {
		folderID, err = s.ensureGoogleDriveFolder(client, rootFolderID, dir)
		if err != nil {
			return "", "", err
		}
		baseName = path.Base(remoteFileName)
	}
	return folderID, baseName, nil
}

// DownloadGoogleDrive downloads a file from Google Drive.
func (s *CloudStorageService) DownloadGoogleDrive(storageID int64, remoteFileName, localPath, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return err
	}

	client, err := s.googleHTTPClient(storageID, cfg, redirectURL)
	if err != nil {
		return err
	}

	searchFolder, searchName, err := s.resolveGoogleDrivePath(client, remoteFileName, cfg.FolderID)
	if err != nil {
		return err
	}

	fileID, err := s.findGoogleDriveFile(client, searchName, searchFolder)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET",
		fmt.Sprintf("https://www.googleapis.com/drive/v3/files/%s?alt=media", fileID), nil)
	resp, err := client.Do(req)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "Google Drive download failed")
	}
	defer resp.Body.Close()

	outFile, err := os.Create(localPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create local file")
	}
	defer outFile.Close()

	if _, err := io.Copy(outFile, resp.Body); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write downloaded file")
	}

	logger.Info().Str("remote", remoteFileName).Str("local", localPath).Msg("file downloaded from Google Drive")
	return nil
}

// DeleteGoogleDrive deletes a file from Google Drive.
func (s *CloudStorageService) DeleteGoogleDrive(storageID int64, remoteFileName, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return err
	}

	client, err := s.googleHTTPClient(storageID, cfg, redirectURL)
	if err != nil {
		return err
	}

	searchFolder, searchName, err := s.resolveGoogleDrivePath(client, remoteFileName, cfg.FolderID)
	if err != nil {
		logger.Warn().Err(err).Str("file", remoteFileName).Msg("failed to resolve path on Google Drive for deletion")
		return nil
	}

	fileID, err := s.findGoogleDriveFile(client, searchName, searchFolder)
	if err != nil {
		logger.Warn().Err(err).Str("file", remoteFileName).Msg("file not found on Google Drive for deletion")
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "DELETE",
		fmt.Sprintf("https://www.googleapis.com/drive/v3/files/%s", fileID), nil)
	resp, err := client.Do(req)
	if err != nil {
		logger.Warn().Err(err).Str("file", remoteFileName).Msg("failed to delete Google Drive file")
		return nil
	}
	defer resp.Body.Close()

	return nil
}

// ---------------------------------------------------------------------------
// OneDrive operations
// ---------------------------------------------------------------------------

const (
	msAuthURL  = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
	msTokenURL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
)

func (s *CloudStorageService) parseOneDriveConfig(cs *CloudStorage) (OneDriveConfig, error) {
	var cfg OneDriveConfig
	if err := json.Unmarshal([]byte(cs.Config), &cfg); err != nil {
		return cfg, apperrors.Wrap(err, apperrors.ErrValidation, "invalid OneDrive config")
	}
	return cfg, nil
}

func (s *CloudStorageService) oneDriveOAuthConfig(cfg OneDriveConfig, redirectURL string) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		Endpoint: oauth2.Endpoint{
			AuthURL:  msAuthURL,
			TokenURL: msTokenURL,
		},
		RedirectURL: redirectURL,
		Scopes:      []string{"Files.ReadWrite.All", "offline_access"},
	}
}

// GetOneDriveAuthURL returns an OAuth authorization URL for OneDrive.
func (s *CloudStorageService) GetOneDriveAuthURL(storageID int64, redirectURL string) (string, error) {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return "", err
	}
	cfg, err := s.parseOneDriveConfig(cs)
	if err != nil {
		return "", err
	}

	oauthCfg := s.oneDriveOAuthConfig(cfg, redirectURL)
	state := fmt.Sprintf("%d", storageID)
	url := oauthCfg.AuthCodeURL(state, oauth2.AccessTypeOffline)
	return url, nil
}

// HandleOneDriveCallback exchanges an OAuth code for tokens and saves them.
func (s *CloudStorageService) HandleOneDriveCallback(storageID int64, code, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseOneDriveConfig(cs)
	if err != nil {
		return err
	}

	oauthCfg := s.oneDriveOAuthConfig(cfg, redirectURL)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	token, err := oauthCfg.Exchange(ctx, code)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrValidation, "failed to exchange OAuth code")
	}

	cfg.AccessToken = token.AccessToken
	cfg.RefreshToken = token.RefreshToken
	cfg.TokenExpiry = token.Expiry.Format(time.RFC3339)

	return s.updateConfig(storageID, cfg)
}

// oneDriveHTTPClient returns an HTTP client with OAuth2 tokens for OneDrive.
// It uses a token source that automatically refreshes expired tokens
// and persists the new tokens to the database.
func (s *CloudStorageService) oneDriveHTTPClient(storageID int64, cfg OneDriveConfig, redirectURL string) (*http.Client, error) {
	oauthCfg := s.oneDriveOAuthConfig(cfg, redirectURL)
	expiry, _ := time.Parse(time.RFC3339, cfg.TokenExpiry)
	token := &oauth2.Token{
		AccessToken:  cfg.AccessToken,
		RefreshToken: cfg.RefreshToken,
		Expiry:       expiry,
		TokenType:    "Bearer",
	}
	// Create a token source that automatically refreshes expired tokens
	// and saves new tokens to the database.
	tokenSource := oauthCfg.TokenSource(context.Background(), token)
	savingTokenSource := &oauthSavingTokenSource{
		TokenSource: tokenSource,
		storageID:   storageID,
		service:     s,
		provider:    "onedrive",
	}
	// oauth2.NewClient creates an http.Client that automatically
	// fetches tokens from the TokenSource as needed.
	return oauth2.NewClient(context.Background(), savingTokenSource), nil
}

// oneDrivePath constructs the Graph API path for a file.
func oneDrivePath(cfg OneDriveConfig, fileName string) string {
	folder := cfg.FolderPath
	if folder == "" {
		folder = "/"
	}
	folder = strings.TrimSuffix(folder, "/")
	if folder == "" || folder == "/" {
		return fmt.Sprintf("/root:/%s:", fileName)
	}
	return fmt.Sprintf("/root:/%s/%s:", strings.TrimPrefix(folder, "/"), fileName)
}

// oneDriveBaseURL returns the base Graph API URL for the drive.
func oneDriveBaseURL(cfg OneDriveConfig) string {
	if cfg.DriveID != "" {
		return fmt.Sprintf("https://graph.microsoft.com/v1.0/drives/%s", cfg.DriveID)
	}
	return "https://graph.microsoft.com/v1.0/me/drive"
}

// TestOneDrive tests a OneDrive connection.
func (s *CloudStorageService) TestOneDrive(storageID int64, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseOneDriveConfig(cs)
	if err != nil {
		return err
	}

	if cfg.AccessToken == "" && cfg.RefreshToken == "" {
		return apperrors.New(apperrors.ErrValidation, "OneDrive not authorized — complete OAuth flow first")
	}

	client, err := s.oneDriveHTTPClient(storageID, cfg, redirectURL)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", oneDriveBaseURL(cfg), nil)
	resp, err := client.Do(req)
	if err != nil {
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("OneDrive connection failed: %v", err))
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("OneDrive API error (%d): %s", resp.StatusCode, string(body)))
	}

	return nil
}

// UploadOneDrive uploads a file to OneDrive.
func (s *CloudStorageService) UploadOneDrive(storageID int64, localPath, remoteFileName, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseOneDriveConfig(cs)
	if err != nil {
		return err
	}

	client, err := s.oneDriveHTTPClient(storageID, cfg, redirectURL)
	if err != nil {
		return err
	}

	file, err := os.Open(localPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to open local file for upload")
	}
	defer file.Close()

	uploadURL := fmt.Sprintf("%s%s/content", oneDriveBaseURL(cfg), oneDrivePath(cfg, remoteFileName))

	req, _ := http.NewRequest("PUT", uploadURL, file)
	req.Header.Set("Content-Type", "application/octet-stream")

	resp, err := client.Do(req)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "OneDrive upload failed")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return apperrors.New(apperrors.ErrInternal, fmt.Sprintf("OneDrive upload error (%d): %s", resp.StatusCode, string(respBody)))
	}

	logger.Info().Str("local", localPath).Str("remote", remoteFileName).Msg("file uploaded to OneDrive")
	return nil
}

// DownloadOneDrive downloads a file from OneDrive.
func (s *CloudStorageService) DownloadOneDrive(storageID int64, remoteFileName, localPath, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseOneDriveConfig(cs)
	if err != nil {
		return err
	}

	client, err := s.oneDriveHTTPClient(storageID, cfg, redirectURL)
	if err != nil {
		return err
	}

	downloadURL := fmt.Sprintf("%s%s/content", oneDriveBaseURL(cfg), oneDrivePath(cfg, remoteFileName))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", downloadURL, nil)
	resp, err := client.Do(req)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "OneDrive download failed")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return apperrors.New(apperrors.ErrInternal, fmt.Sprintf("OneDrive download error (%d): %s", resp.StatusCode, string(respBody)))
	}

	outFile, err := os.Create(localPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create local file")
	}
	defer outFile.Close()

	if _, err := io.Copy(outFile, resp.Body); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write downloaded file")
	}

	logger.Info().Str("remote", remoteFileName).Str("local", localPath).Msg("file downloaded from OneDrive")
	return nil
}

// DeleteOneDrive deletes a file from OneDrive.
func (s *CloudStorageService) DeleteOneDrive(storageID int64, remoteFileName, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseOneDriveConfig(cs)
	if err != nil {
		return err
	}

	client, err := s.oneDriveHTTPClient(storageID, cfg, redirectURL)
	if err != nil {
		return err
	}

	deleteURL := fmt.Sprintf("%s%s", oneDriveBaseURL(cfg), oneDrivePath(cfg, remoteFileName))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "DELETE", deleteURL, nil)
	resp, err := client.Do(req)
	if err != nil {
		logger.Warn().Err(err).Str("file", remoteFileName).Msg("failed to delete OneDrive file")
		return nil
	}
	defer resp.Body.Close()

	return nil
}

// ---------------------------------------------------------------------------
// Generic dispatch methods
// ---------------------------------------------------------------------------

// TestConnection tests a cloud storage connection by ID.
func (s *CloudStorageService) TestConnection(id int64, redirectURL string) error {
	cs, err := s.GetByID(id)
	if err != nil {
		return err
	}

	switch cs.Type {
	case "s3":
		cfg, err := s.parseS3Config(cs)
		if err != nil {
			return err
		}
		return s.TestS3(cfg)
	case "google_drive":
		return s.TestGoogleDrive(id, redirectURL)
	case "onedrive":
		return s.TestOneDrive(id, redirectURL)
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported storage type: "+cs.Type)
	}
}

// UploadFile uploads a file to the specified cloud storage.
func (s *CloudStorageService) UploadFile(id int64, localPath, remoteFileName, redirectURL string) error {
	cs, err := s.GetByID(id)
	if err != nil {
		return err
	}

	switch cs.Type {
	case "s3":
		return s.UploadS3(id, localPath, remoteFileName)
	case "google_drive":
		return s.UploadGoogleDrive(id, localPath, remoteFileName, redirectURL)
	case "onedrive":
		return s.UploadOneDrive(id, localPath, remoteFileName, redirectURL)
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported storage type: "+cs.Type)
	}
}

// DownloadFile downloads a file from the specified cloud storage.
func (s *CloudStorageService) DownloadFile(id int64, remoteFileName, localPath, redirectURL string) error {
	cs, err := s.GetByID(id)
	if err != nil {
		return err
	}

	switch cs.Type {
	case "s3":
		return s.DownloadS3(id, remoteFileName, localPath)
	case "google_drive":
		return s.DownloadGoogleDrive(id, remoteFileName, localPath, redirectURL)
	case "onedrive":
		return s.DownloadOneDrive(id, remoteFileName, localPath, redirectURL)
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported storage type: "+cs.Type)
	}
}

// DeleteFile deletes a file from the specified cloud storage.
func (s *CloudStorageService) DeleteFile(id int64, remoteFileName, redirectURL string) error {
	cs, err := s.GetByID(id)
	if err != nil {
		return err
	}

	switch cs.Type {
	case "s3":
		return s.DeleteS3(id, remoteFileName)
	case "google_drive":
		return s.DeleteGoogleDrive(id, remoteFileName, redirectURL)
	case "onedrive":
		return s.DeleteOneDrive(id, remoteFileName, redirectURL)
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported storage type: "+cs.Type)
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// updateConfig marshals a config struct and saves it to the database.
func (s *CloudStorageService) updateConfig(id int64, cfg any) error {
	configJSON, err := json.Marshal(cfg)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to marshal config")
	}

	_, err = s.db.Exec(
		"UPDATE cloud_storages SET config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		string(configJSON), id,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update cloud storage config")
	}

	return nil
}

// TestInlineS3 tests an S3 connection from inline config (not saved to DB).
func (s *CloudStorageService) TestInlineS3(cfg S3Config) error {
	return s.TestS3(cfg)
}

// TestInline tests a cloud storage connection from inline config.
func (s *CloudStorageService) TestInline(storageType string, configJSON string) error {
	switch storageType {
	case "s3":
		var cfg S3Config
		if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
			return apperrors.Wrap(err, apperrors.ErrValidation, "invalid S3 config")
		}
		return s.TestS3(cfg)
	case "google_drive":
		return apperrors.New(apperrors.ErrValidation, "Google Drive requires OAuth — use auth-url endpoint first")
	case "onedrive":
		return apperrors.New(apperrors.ErrValidation, "OneDrive requires OAuth — use auth-url endpoint first")
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported storage type: "+storageType)
	}
}

// GetAuthURL returns an OAuth URL for the given storage (Google Drive or OneDrive).
func (s *CloudStorageService) GetAuthURL(id int64, redirectURL string) (string, string, error) {
	cs, err := s.GetByID(id)
	if err != nil {
		return "", "", err
	}

	switch cs.Type {
	case "google_drive":
		// Google Drive now uses the Device Authorization Flow via
		// InitiateDeviceAuth / PollDeviceAuth (POST /:id/device-auth/*).
		// GET /:id/auth-url no longer returns a URL for Google Drive.
		return "", "", apperrors.New(apperrors.ErrValidation,
			"google_drive uses device authorization flow — call POST /:id/device-auth/start")
	case "onedrive":
		// OneDrive: redirect flow works fine — no private IP restriction.
		url, err := s.GetOneDriveAuthURL(id, redirectURL)
		return url, "onedrive", err
	default:
		return "", "", apperrors.New(apperrors.ErrValidation, "storage type does not support OAuth: "+cs.Type)
	}
}

// HandleOAuthCallback handles the OAuth callback based on provider.
func (s *CloudStorageService) HandleOAuthCallback(provider string, storageID int64, code, redirectURL string) error {
	switch provider {
	case "google_drive":
		return s.HandleGoogleCallback(storageID, code, redirectURL)
	case "onedrive":
		return s.HandleOneDriveCallback(storageID, code, redirectURL)
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported OAuth provider: "+provider)
	}
}
