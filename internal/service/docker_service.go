package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

const dockerAPIVersion = "v1.41"
const dockerSocket = "/var/run/docker.sock"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Port represents a container port mapping.
type Port struct {
	IP          string `json:"ip,omitempty"`
	PrivatePort uint16 `json:"private_port"`
	PublicPort  uint16 `json:"public_port,omitempty"`
	Type        string `json:"type"`
}

// Container is a summary returned when listing containers.
type Container struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Image   string `json:"image"`
	Status  string `json:"status"`
	State   string `json:"state"`
	Ports   []Port `json:"ports"`
	Created int64  `json:"created"`
}

// ContainerDetail holds the full inspect result for a single container.
type ContainerDetail struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	Image      string            `json:"image"`
	Status     string            `json:"status"`
	State      string            `json:"state"`
	Ports      []Port            `json:"ports"`
	Created    string            `json:"created"`
	Platform   string            `json:"platform"`
	Command    string            `json:"command"`
	Env        []string          `json:"env"`
	Mounts     []Mount           `json:"mounts"`
	Networks   map[string]string `json:"networks"`
	RestartPol string            `json:"restart_policy"`
}

// Mount describes a container mount/volume.
type Mount struct {
	Type        string `json:"type"`
	Source      string `json:"source"`
	Destination string `json:"destination"`
	RW          bool   `json:"rw"`
}

// ContainerStats holds live resource usage for a container.
type ContainerStats struct {
	CPUPercent float64 `json:"cpu_percent"`
	MemUsage   uint64  `json:"mem_usage"`
	MemLimit   uint64  `json:"mem_limit"`
	MemPercent float64 `json:"mem_percent"`
	NetInput   uint64  `json:"net_input"`
	NetOutput  uint64  `json:"net_output"`
	BlockRead  uint64  `json:"block_read"`
	BlockWrite uint64  `json:"block_write"`
	PIDs       uint64  `json:"pids"`
}

// Image represents a Docker image.
type Image struct {
	ID      string   `json:"id"`
	Tags    []string `json:"tags"`
	Size    int64    `json:"size"`
	Created int64    `json:"created"`
}

// Network represents a Docker network.
type Network struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Driver          string `json:"driver"`
	Scope           string `json:"scope"`
	Subnet          string `json:"subnet"`
	Gateway         string `json:"gateway"`
	Internal        bool   `json:"internal"`
	EnableIPv6      bool   `json:"enable_ipv6"`
	ContainerCount  int    `json:"container_count"`
	Created         string `json:"created"`
}

// Volume represents a Docker volume.
type Volume struct {
	Name       string `json:"name"`
	Driver     string `json:"driver"`
	Mountpoint string `json:"mountpoint"`
	CreatedAt  string `json:"created_at"`
}

// DockerInfo holds high-level Docker daemon information.
type DockerInfo struct {
	ServerVersion string `json:"server_version"`
	NCPU          int    `json:"ncpu"`
	MemTotal      int64  `json:"mem_total"`
	Containers    int    `json:"containers"`
	Running       int    `json:"running"`
	Paused        int    `json:"paused"`
	Stopped       int    `json:"stopped"`
	Images        int    `json:"images"`
	Driver        string `json:"driver"`
	DockerRoot    string `json:"docker_root"`
	OS            string `json:"os"`
	Arch          string `json:"arch"`
}

// CreateContainerRequest describes the payload to create a container.
type CreateContainerRequest struct {
	Name          string            `json:"name"`
	Image         string            `json:"image"`
	Ports         map[string]string `json:"ports"`
	Env           []string          `json:"env"`
	Volumes       []string          `json:"volumes"`
	RestartPolicy string            `json:"restart_policy"`
	Command       string            `json:"command"`
}

// NetworkContainerEndpoint holds per-container info inside a network.
type NetworkContainerEndpoint struct {
	Name        string `json:"name"`
	IPv4Address string `json:"ipv4_address"`
	IPv6Address string `json:"ipv6_address,omitempty"`
	MacAddress  string `json:"mac_address"`
}

// IPAMConfig holds a single IPAM pool entry.
type IPAMConfig struct {
	Subnet  string `json:"subnet"`
	Gateway string `json:"gateway"`
}

// NetworkDetail holds full info about a Docker network.
type NetworkDetail struct {
	ID           string                               `json:"id"`
	Name         string                               `json:"name"`
	Driver       string                               `json:"driver"`
	Scope        string                               `json:"scope"`
	Internal     bool                                 `json:"internal"`
	EnableIPv6   bool                                 `json:"enable_ipv6"`
	IPAM         []IPAMConfig                         `json:"ipam"`
	IPAMDriver   string                               `json:"ipam_driver"`
	Containers   map[string]NetworkContainerEndpoint   `json:"containers"`
	Options      map[string]string                    `json:"options"`
	Labels       map[string]string                    `json:"labels"`
	Created      string                               `json:"created"`
	// Convenience fields kept for backward compat
	Subnet  string `json:"subnet"`
	Gateway string `json:"gateway"`
}

// VolumeDetail holds full info about a Docker volume.
type VolumeDetail struct {
	Name       string            `json:"name"`
	Driver     string            `json:"driver"`
	Mountpoint string            `json:"mountpoint"`
	Labels     map[string]string `json:"labels"`
	Options    map[string]string `json:"options"`
	CreatedAt  string            `json:"created_at"`
	UsedBy     []string          `json:"used_by"`
}

// ImageDetail holds the full inspect info about a Docker image.
type ImageDetail struct {
	ID           string            `json:"id"`
	Tags         []string          `json:"tags"`
	Size         int64             `json:"size"`
	Created      string            `json:"created"`
	OS           string            `json:"os"`
	Arch         string            `json:"arch"`
	Author       string            `json:"author"`
	Env          []string          `json:"env"`
	Cmd          []string          `json:"cmd"`
	Entrypoint   []string          `json:"entrypoint"`
	WorkingDir   string            `json:"working_dir"`
	ExposedPorts []string          `json:"exposed_ports"`
	Volumes      []string          `json:"volumes"`
	Labels       map[string]string `json:"labels"`
}

// ImageSearchResult holds a Docker Hub search result.
type ImageSearchResult struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Stars       int    `json:"stars"`
	Official    bool   `json:"official"`
}

// ImageHistoryEntry holds one layer in image history.
type ImageHistoryEntry struct {
	ID        string `json:"id"`
	Created   int64  `json:"created"`
	CreatedBy string `json:"created_by"`
	Size      int64  `json:"size"`
	Comment   string `json:"comment"`
}

// SystemDiskUsage holds Docker system disk usage info.
type SystemDiskUsage struct {
	ImagesCount     int   `json:"images_count"`
	ImagesSize      int64 `json:"images_size"`
	ContainersCount int   `json:"containers_count"`
	ContainersSize  int64 `json:"containers_size"`
	VolumesCount    int   `json:"volumes_count"`
	VolumesSize     int64 `json:"volumes_size"`
	BuildCacheSize  int64 `json:"build_cache_size"`
}

// CreateNetworkRequest describes the payload to create a network.
type CreateNetworkRequest struct {
	Name     string `json:"name"`
	Driver   string `json:"driver"`
	Subnet   string `json:"subnet"`
	Gateway  string `json:"gateway"`
	Internal bool   `json:"internal"`
}

// CreateVolumeRequest describes the payload to create a volume.
type CreateVolumeRequest struct {
	Name    string            `json:"name"`
	Driver  string            `json:"driver"`
	Labels  map[string]string `json:"labels"`
	Options map[string]string `json:"driver_opts"`
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// DockerService talks to the Docker Engine API via the Unix socket.
type DockerService struct {
	client *http.Client
}

// NewDockerService creates a DockerService that communicates over the
// Docker Unix socket.
func NewDockerService() *DockerService {
	return &DockerService{
		client: &http.Client{
			Transport: &http.Transport{
				DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
					return net.DialTimeout("unix", dockerSocket, 5*time.Second)
				},
			},
			Timeout: 30 * time.Second,
		},
	}
}

// IsDockerInstalled checks whether the Docker socket is reachable.
func (s *DockerService) IsDockerInstalled() bool {
	resp, err := s.get("/_ping")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// GetDockerInfo returns high-level Docker daemon info.
func (s *DockerService) GetDockerInfo() (*DockerInfo, error) {
	resp, err := s.get("/info")
	if err != nil {
		return nil, fmt.Errorf("docker info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw struct {
		ServerVersion  string `json:"ServerVersion"`
		NCPU           int    `json:"NCPU"`
		MemTotal       int64  `json:"MemTotal"`
		Containers     int    `json:"Containers"`
		ContRunning    int    `json:"ContainersRunning"`
		ContPaused     int    `json:"ContainersPaused"`
		ContStopped    int    `json:"ContainersStopped"`
		Images         int    `json:"Images"`
		Driver         string `json:"Driver"`
		DockerRootDir  string `json:"DockerRootDir"`
		OperatingSystem string `json:"OperatingSystem"`
		Architecture   string `json:"Architecture"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("docker info decode: %w", err)
	}

	return &DockerInfo{
		ServerVersion: raw.ServerVersion,
		NCPU:          raw.NCPU,
		MemTotal:      raw.MemTotal,
		Containers:    raw.Containers,
		Running:       raw.ContRunning,
		Paused:        raw.ContPaused,
		Stopped:       raw.ContStopped,
		Images:        raw.Images,
		Driver:        raw.Driver,
		DockerRoot:    raw.DockerRootDir,
		OS:            raw.OperatingSystem,
		Arch:          raw.Architecture,
	}, nil
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

// ListContainers returns running (or all) containers.
func (s *DockerService) ListContainers(all bool) ([]*Container, error) {
	path := "/containers/json"
	if all {
		path += "?all=true"
	}

	resp, err := s.get(path)
	if err != nil {
		return nil, fmt.Errorf("list containers: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw []struct {
		ID      string `json:"Id"`
		Names   []string
		Image   string
		Status  string
		State   string
		Created int64
		Ports   []struct {
			IP          string `json:"IP"`
			PrivatePort uint16 `json:"PrivatePort"`
			PublicPort  uint16 `json:"PublicPort"`
			Type        string `json:"Type"`
		}
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("list containers decode: %w", err)
	}

	containers := make([]*Container, 0, len(raw))
	for _, c := range raw {
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		ports := make([]Port, 0, len(c.Ports))
		for _, p := range c.Ports {
			ports = append(ports, Port{
				IP:          p.IP,
				PrivatePort: p.PrivatePort,
				PublicPort:  p.PublicPort,
				Type:        p.Type,
			})
		}
		containers = append(containers, &Container{
			ID:      c.ID[:12],
			Name:    name,
			Image:   c.Image,
			Status:  c.Status,
			State:   c.State,
			Ports:   ports,
			Created: c.Created,
		})
	}
	return containers, nil
}

// GetContainer returns detailed information about a single container.
func (s *DockerService) GetContainer(id string) (*ContainerDetail, error) {
	resp, err := s.get(fmt.Sprintf("/containers/%s/json", id))
	if err != nil {
		return nil, fmt.Errorf("get container: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw struct {
		ID      string `json:"Id"`
		Name    string
		Created string
		Platform string
		Config  struct {
			Image string
			Env   []string
			Cmd   []string
		}
		State struct {
			Status string
		}
		HostConfig struct {
			RestartPolicy struct {
				Name string
			}
		}
		Mounts []struct {
			Type        string
			Source      string
			Destination string
			RW          bool
		}
		NetworkSettings struct {
			Networks map[string]struct {
				IPAddress string
			}
			Ports map[string][]struct {
				HostIP   string `json:"HostIp"`
				HostPort string
			}
		}
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("get container decode: %w", err)
	}

	mounts := make([]Mount, 0, len(raw.Mounts))
	for _, m := range raw.Mounts {
		mounts = append(mounts, Mount{
			Type:        m.Type,
			Source:      m.Source,
			Destination: m.Destination,
			RW:          m.RW,
		})
	}

	networks := make(map[string]string)
	for name, net := range raw.NetworkSettings.Networks {
		networks[name] = net.IPAddress
	}

	var ports []Port
	for portProto, bindings := range raw.NetworkSettings.Ports {
		parts := strings.SplitN(portProto, "/", 2)
		privPort := uint16(0)
		if len(parts) > 0 {
			fmt.Sscanf(parts[0], "%d", &privPort)
		}
		proto := "tcp"
		if len(parts) > 1 {
			proto = parts[1]
		}
		for _, b := range bindings {
			pubPort := uint16(0)
			fmt.Sscanf(b.HostPort, "%d", &pubPort)
			ports = append(ports, Port{
				IP:          b.HostIP,
				PrivatePort: privPort,
				PublicPort:  pubPort,
				Type:        proto,
			})
		}
		if len(bindings) == 0 {
			ports = append(ports, Port{
				PrivatePort: privPort,
				Type:        proto,
			})
		}
	}

	cmd := ""
	if len(raw.Config.Cmd) > 0 {
		cmd = strings.Join(raw.Config.Cmd, " ")
	}

	return &ContainerDetail{
		ID:         raw.ID[:12],
		Name:       strings.TrimPrefix(raw.Name, "/"),
		Image:      raw.Config.Image,
		Status:     raw.State.Status,
		State:      raw.State.Status,
		Ports:      ports,
		Created:    raw.Created,
		Platform:   raw.Platform,
		Command:    cmd,
		Env:        raw.Config.Env,
		Mounts:     mounts,
		Networks:   networks,
		RestartPol: raw.HostConfig.RestartPolicy.Name,
	}, nil
}

// CreateContainer creates (but does not start) a new container.
func (s *DockerService) CreateContainer(req CreateContainerRequest) (*Container, error) {
	// Build the create payload.
	body := map[string]any{
		"Image": req.Image,
	}
	if req.Command != "" {
		body["Cmd"] = strings.Fields(req.Command)
	}
	if len(req.Env) > 0 {
		body["Env"] = req.Env
	}

	// Port bindings & exposed ports.
	exposedPorts := map[string]any{}
	portBindings := map[string]any{}
	for hostPort, containerPort := range req.Ports {
		key := containerPort + "/tcp"
		exposedPorts[key] = struct{}{}
		portBindings[key] = []map[string]string{
			{"HostPort": hostPort},
		}
	}
	if len(exposedPorts) > 0 {
		body["ExposedPorts"] = exposedPorts
	}

	// Volumes / Binds – pre-create host directories so containers that run
	// as non-root (e.g. Grafana UID 472) can write to them.
	var binds []string
	for _, v := range req.Volumes {
		binds = append(binds, v)
		parts := strings.SplitN(v, ":", 2)
		if len(parts) == 2 && strings.HasPrefix(parts[0], "/") {
			hostDir := parts[0]
			if err := os.MkdirAll(hostDir, 0777); err == nil {
				os.Chmod(hostDir, 0777)
			}
		}
	}

	restartPolicy := "no"
	if req.RestartPolicy != "" {
		restartPolicy = req.RestartPolicy
	}

	hostConfig := map[string]any{
		"RestartPolicy": map[string]any{
			"Name": restartPolicy,
		},
	}
	if len(portBindings) > 0 {
		hostConfig["PortBindings"] = portBindings
	}
	if len(binds) > 0 {
		hostConfig["Binds"] = binds
	}
	body["HostConfig"] = hostConfig

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("create container marshal: %w", err)
	}

	path := "/containers/create"
	if req.Name != "" {
		path += "?name=" + req.Name
	}

	resp, err := s.post(path, string(payload))
	if err != nil {
		return nil, fmt.Errorf("create container: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return nil, s.readError(resp)
	}

	var result struct {
		ID string `json:"Id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("create container decode: %w", err)
	}

	logger.Info().Str("container", result.ID[:12]).Str("image", req.Image).Msg("container created")

	shortID := result.ID
	if len(shortID) > 12 {
		shortID = shortID[:12]
	}
	return &Container{
		ID:    shortID,
		Name:  req.Name,
		Image: req.Image,
		State: "created",
	}, nil
}

// StartContainer starts a stopped container.
func (s *DockerService) StartContainer(id string) error {
	resp, err := s.post(fmt.Sprintf("/containers/%s/start", id), "")
	if err != nil {
		return fmt.Errorf("start container: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusNotModified {
		return s.readError(resp)
	}
	logger.Info().Str("container", id).Msg("container started")
	return nil
}

// StopContainer stops a running container (10s timeout).
func (s *DockerService) StopContainer(id string) error {
	resp, err := s.post(fmt.Sprintf("/containers/%s/stop?t=10", id), "")
	if err != nil {
		return fmt.Errorf("stop container: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusNotModified {
		return s.readError(resp)
	}
	logger.Info().Str("container", id).Msg("container stopped")
	return nil
}

// RestartContainer restarts a container.
func (s *DockerService) RestartContainer(id string) error {
	resp, err := s.post(fmt.Sprintf("/containers/%s/restart?t=10", id), "")
	if err != nil {
		return fmt.Errorf("restart container: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		return s.readError(resp)
	}
	logger.Info().Str("container", id).Msg("container restarted")
	return nil
}

// RemoveContainer removes a container.
func (s *DockerService) RemoveContainer(id string, force bool) error {
	path := fmt.Sprintf("/containers/%s", id)
	if force {
		path += "?force=true"
	}

	resp, err := s.delete(path)
	if err != nil {
		return fmt.Errorf("remove container: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		return s.readError(resp)
	}
	logger.Info().Str("container", id).Bool("force", force).Msg("container removed")
	return nil
}

// GetContainerLogs returns the last N lines from a container's logs.
func (s *DockerService) GetContainerLogs(id string, tail int) (string, error) {
	if tail <= 0 {
		tail = 100
	}
	path := fmt.Sprintf("/containers/%s/logs?stdout=true&stderr=true&tail=%d", id, tail)

	resp, err := s.get(path)
	if err != nil {
		return "", fmt.Errorf("container logs: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", s.readError(resp)
	}

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("container logs read: %w", err)
	}

	// Docker multiplexed stream: each frame has an 8-byte header.
	// Strip headers to return clean text.
	return stripDockerLogHeaders(raw), nil
}

// GetContainerStats returns a one-shot stats snapshot.
func (s *DockerService) GetContainerStats(id string) (*ContainerStats, error) {
	path := fmt.Sprintf("/containers/%s/stats?stream=false", id)

	resp, err := s.get(path)
	if err != nil {
		return nil, fmt.Errorf("container stats: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw struct {
		CPUStats struct {
			CPUUsage struct {
				TotalUsage uint64 `json:"total_usage"`
			} `json:"cpu_usage"`
			SystemCPUUsage uint64 `json:"system_cpu_usage"`
			OnlineCPUs     int    `json:"online_cpus"`
		} `json:"cpu_stats"`
		PreCPUStats struct {
			CPUUsage struct {
				TotalUsage uint64 `json:"total_usage"`
			} `json:"cpu_usage"`
			SystemCPUUsage uint64 `json:"system_cpu_usage"`
		} `json:"precpu_stats"`
		MemoryStats struct {
			Usage uint64 `json:"usage"`
			Limit uint64 `json:"limit"`
		} `json:"memory_stats"`
		Networks map[string]struct {
			RxBytes uint64 `json:"rx_bytes"`
			TxBytes uint64 `json:"tx_bytes"`
		} `json:"networks"`
		BlkioStats struct {
			IOServiceBytesRecursive []struct {
				Op    string `json:"op"`
				Value uint64 `json:"value"`
			} `json:"io_service_bytes_recursive"`
		} `json:"blkio_stats"`
		PidsStats struct {
			Current uint64 `json:"current"`
		} `json:"pids_stats"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("container stats decode: %w", err)
	}

	// CPU percentage calculation.
	cpuDelta := float64(raw.CPUStats.CPUUsage.TotalUsage - raw.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(raw.CPUStats.SystemCPUUsage - raw.PreCPUStats.SystemCPUUsage)
	cpuPercent := 0.0
	if sysDelta > 0 && cpuDelta > 0 {
		cpuPercent = (cpuDelta / sysDelta) * float64(raw.CPUStats.OnlineCPUs) * 100.0
	}

	// Memory percentage.
	memPercent := 0.0
	if raw.MemoryStats.Limit > 0 {
		memPercent = float64(raw.MemoryStats.Usage) / float64(raw.MemoryStats.Limit) * 100.0
	}

	// Network I/O.
	var netIn, netOut uint64
	for _, v := range raw.Networks {
		netIn += v.RxBytes
		netOut += v.TxBytes
	}

	// Block I/O.
	var blkRead, blkWrite uint64
	for _, entry := range raw.BlkioStats.IOServiceBytesRecursive {
		switch entry.Op {
		case "Read", "read":
			blkRead += entry.Value
		case "Write", "write":
			blkWrite += entry.Value
		}
	}

	return &ContainerStats{
		CPUPercent: cpuPercent,
		MemUsage:   raw.MemoryStats.Usage,
		MemLimit:   raw.MemoryStats.Limit,
		MemPercent: memPercent,
		NetInput:   netIn,
		NetOutput:  netOut,
		BlockRead:  blkRead,
		BlockWrite: blkWrite,
		PIDs:       raw.PidsStats.Current,
	}, nil
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

// ListImages returns all images.
func (s *DockerService) ListImages() ([]*Image, error) {
	resp, err := s.get("/images/json")
	if err != nil {
		return nil, fmt.Errorf("list images: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw []struct {
		ID       string   `json:"Id"`
		RepoTags []string `json:"RepoTags"`
		Size     int64    `json:"Size"`
		Created  int64    `json:"Created"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("list images decode: %w", err)
	}

	images := make([]*Image, 0, len(raw))
	for _, i := range raw {
		id := i.ID
		if strings.HasPrefix(id, "sha256:") {
			id = id[7:]
		}
		if len(id) > 12 {
			id = id[:12]
		}
		images = append(images, &Image{
			ID:      id,
			Tags:    i.RepoTags,
			Size:    i.Size,
			Created: i.Created,
		})
	}
	return images, nil
}

// PullImage pulls an image by name (e.g. "nginx:latest").
func (s *DockerService) PullImage(name string) error {
	path := fmt.Sprintf("/images/create?fromImage=%s", name)

	resp, err := s.post(path, "")
	if err != nil {
		return fmt.Errorf("pull image: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return s.readError(resp)
	}

	// Drain the streaming response so the pull completes.
	_, _ = io.Copy(io.Discard, resp.Body)

	logger.Info().Str("image", name).Msg("image pulled")
	return nil
}

// RemoveImage removes an image.
func (s *DockerService) RemoveImage(id string, force bool) error {
	path := fmt.Sprintf("/images/%s", id)
	if force {
		path += "?force=true"
	}

	resp, err := s.delete(path)
	if err != nil {
		return fmt.Errorf("remove image: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return s.readError(resp)
	}
	logger.Info().Str("image", id).Bool("force", force).Msg("image removed")
	return nil
}

// ---------------------------------------------------------------------------
// Networks & Volumes
// ---------------------------------------------------------------------------

// ListNetworks returns all Docker networks.
func (s *DockerService) ListNetworks() ([]*Network, error) {
	resp, err := s.get("/networks")
	if err != nil {
		return nil, fmt.Errorf("list networks: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw []struct {
		ID         string `json:"Id"`
		Name       string `json:"Name"`
		Driver     string `json:"Driver"`
		Scope      string `json:"Scope"`
		Created    string `json:"Created"`
		Internal   bool   `json:"Internal"`
		EnableIPv6 bool   `json:"EnableIPv6"`
		IPAM       struct {
			Config []struct {
				Subnet  string
				Gateway string
			}
		}
		Containers map[string]struct {
			Name string
		}
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("list networks decode: %w", err)
	}

	networks := make([]*Network, 0, len(raw))
	for _, n := range raw {
		id := n.ID
		if len(id) > 12 {
			id = id[:12]
		}
		subnet, gateway := "", ""
		if len(n.IPAM.Config) > 0 {
			subnet = n.IPAM.Config[0].Subnet
			gateway = n.IPAM.Config[0].Gateway
		}
		networks = append(networks, &Network{
			ID:             id,
			Name:           n.Name,
			Driver:         n.Driver,
			Scope:          n.Scope,
			Subnet:         subnet,
			Gateway:        gateway,
			Internal:       n.Internal,
			EnableIPv6:     n.EnableIPv6,
			ContainerCount: len(n.Containers),
			Created:        n.Created,
		})
	}
	return networks, nil
}

// ListVolumes returns all Docker volumes.
func (s *DockerService) ListVolumes() ([]*Volume, error) {
	resp, err := s.get("/volumes")
	if err != nil {
		return nil, fmt.Errorf("list volumes: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw struct {
		Volumes []struct {
			Name       string `json:"Name"`
			Driver     string `json:"Driver"`
			Mountpoint string `json:"Mountpoint"`
			CreatedAt  string `json:"CreatedAt"`
		} `json:"Volumes"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("list volumes decode: %w", err)
	}

	volumes := make([]*Volume, 0, len(raw.Volumes))
	for _, v := range raw.Volumes {
		volumes = append(volumes, &Volume{
			Name:       v.Name,
			Driver:     v.Driver,
			Mountpoint: v.Mountpoint,
			CreatedAt:  v.CreatedAt,
		})
	}
	return volumes, nil
}

// ---------------------------------------------------------------------------
// Container extensions
// ---------------------------------------------------------------------------

// PauseContainer pauses a running container.
func (s *DockerService) PauseContainer(id string) error {
	resp, err := s.post(fmt.Sprintf("/containers/%s/pause", id), "")
	if err != nil {
		return fmt.Errorf("pause container: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		return s.readError(resp)
	}
	logger.Info().Str("container", id).Msg("container paused")
	return nil
}

// UnpauseContainer unpauses a paused container.
func (s *DockerService) UnpauseContainer(id string) error {
	resp, err := s.post(fmt.Sprintf("/containers/%s/unpause", id), "")
	if err != nil {
		return fmt.Errorf("unpause container: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		return s.readError(resp)
	}
	logger.Info().Str("container", id).Msg("container unpaused")
	return nil
}

// RenameContainer renames a container.
func (s *DockerService) RenameContainer(id, newName string) error {
	resp, err := s.post(fmt.Sprintf("/containers/%s/rename?name=%s", id, newName), "")
	if err != nil {
		return fmt.Errorf("rename container: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		return s.readError(resp)
	}
	logger.Info().Str("container", id).Str("new_name", newName).Msg("container renamed")
	return nil
}

// ---------------------------------------------------------------------------
// Image extensions
// ---------------------------------------------------------------------------

// SearchImages searches Docker Hub for images.
func (s *DockerService) SearchImages(term string) ([]*ImageSearchResult, error) {
	resp, err := s.get(fmt.Sprintf("/images/search?term=%s&limit=25", term))
	if err != nil {
		return nil, fmt.Errorf("search images: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw []struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		StarCount   int    `json:"star_count"`
		IsOfficial  bool   `json:"is_official"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("search images decode: %w", err)
	}

	results := make([]*ImageSearchResult, 0, len(raw))
	for _, r := range raw {
		results = append(results, &ImageSearchResult{
			Name:        r.Name,
			Description: r.Description,
			Stars:       r.StarCount,
			Official:    r.IsOfficial,
		})
	}
	return results, nil
}

// InspectImage returns detailed info about an image.
func (s *DockerService) InspectImage(id string) (*ImageDetail, error) {
	resp, err := s.get(fmt.Sprintf("/images/%s/json", id))
	if err != nil {
		return nil, fmt.Errorf("inspect image: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw struct {
		ID           string `json:"Id"`
		RepoTags     []string
		Size         int64
		Created      string
		Os           string
		Architecture string
		Author       string
		Config       struct {
			Env          []string
			Cmd          []string
			Entrypoint   []string
			WorkingDir   string
			ExposedPorts map[string]struct{}
			Volumes      map[string]struct{}
			Labels       map[string]string
		}
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("inspect image decode: %w", err)
	}

	id2 := raw.ID
	if strings.HasPrefix(id2, "sha256:") {
		id2 = id2[7:]
	}
	if len(id2) > 12 {
		id2 = id2[:12]
	}

	exposedPorts := make([]string, 0)
	for port := range raw.Config.ExposedPorts {
		exposedPorts = append(exposedPorts, port)
	}

	volumes := make([]string, 0)
	for vol := range raw.Config.Volumes {
		volumes = append(volumes, vol)
	}

	return &ImageDetail{
		ID:           id2,
		Tags:         raw.RepoTags,
		Size:         raw.Size,
		Created:      raw.Created,
		OS:           raw.Os,
		Arch:         raw.Architecture,
		Author:       raw.Author,
		Env:          raw.Config.Env,
		Cmd:          raw.Config.Cmd,
		Entrypoint:   raw.Config.Entrypoint,
		WorkingDir:   raw.Config.WorkingDir,
		ExposedPorts: exposedPorts,
		Volumes:      volumes,
		Labels:       raw.Config.Labels,
	}, nil
}

// GetImageHistory returns the build history of an image.
func (s *DockerService) GetImageHistory(id string) ([]*ImageHistoryEntry, error) {
	resp, err := s.get(fmt.Sprintf("/images/%s/history", id))
	if err != nil {
		return nil, fmt.Errorf("image history: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw []struct {
		ID        string `json:"Id"`
		Created   int64  `json:"Created"`
		CreatedBy string `json:"CreatedBy"`
		Size      int64  `json:"Size"`
		Comment   string `json:"Comment"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("image history decode: %w", err)
	}

	entries := make([]*ImageHistoryEntry, 0, len(raw))
	for _, e := range raw {
		id2 := e.ID
		if strings.HasPrefix(id2, "sha256:") {
			id2 = id2[7:]
		}
		if len(id2) > 12 {
			id2 = id2[:12]
		}
		entries = append(entries, &ImageHistoryEntry{
			ID:        id2,
			Created:   e.Created,
			CreatedBy: e.CreatedBy,
			Size:      e.Size,
			Comment:   e.Comment,
		})
	}
	return entries, nil
}

// TagImage tags an image.
func (s *DockerService) TagImage(id, repo, tag string) error {
	path := fmt.Sprintf("/images/%s/tag?repo=%s&tag=%s", id, repo, tag)
	resp, err := s.post(path, "")
	if err != nil {
		return fmt.Errorf("tag image: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		return s.readError(resp)
	}
	logger.Info().Str("image", id).Str("repo", repo).Str("tag", tag).Msg("image tagged")
	return nil
}

// PruneImages removes dangling images.
func (s *DockerService) PruneImages() (int64, error) {
	resp, err := s.post("/images/prune", "")
	if err != nil {
		return 0, fmt.Errorf("prune images: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, s.readError(resp)
	}

	var raw struct {
		SpaceReclaimed int64 `json:"SpaceReclaimed"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return 0, fmt.Errorf("prune images decode: %w", err)
	}
	logger.Info().Int64("reclaimed", raw.SpaceReclaimed).Msg("images pruned")
	return raw.SpaceReclaimed, nil
}

// ---------------------------------------------------------------------------
// Network CRUD
// ---------------------------------------------------------------------------

// InspectNetwork returns detailed info about a network.
func (s *DockerService) InspectNetwork(id string) (*NetworkDetail, error) {
	resp, err := s.get(fmt.Sprintf("/networks/%s", id))
	if err != nil {
		return nil, fmt.Errorf("inspect network: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw struct {
		ID         string `json:"Id"`
		Name       string
		Driver     string
		Scope      string
		Created    string
		Internal   bool
		EnableIPv6 bool
		Options    map[string]string
		Labels     map[string]string
		IPAM       struct {
			Driver  string
			Config  []struct {
				Subnet  string
				Gateway string
			}
		}
		Containers map[string]struct {
			Name        string
			IPv4Address string
			IPv6Address string
			MacAddress  string
		}
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("inspect network decode: %w", err)
	}

	subnet, gateway := "", ""
	var ipamConfigs []IPAMConfig
	for _, cfg := range raw.IPAM.Config {
		ipamConfigs = append(ipamConfigs, IPAMConfig{Subnet: cfg.Subnet, Gateway: cfg.Gateway})
	}
	if len(ipamConfigs) > 0 {
		subnet = ipamConfigs[0].Subnet
		gateway = ipamConfigs[0].Gateway
	}

	containers := make(map[string]NetworkContainerEndpoint)
	for cid, c := range raw.Containers {
		short := cid
		if len(short) > 12 {
			short = short[:12]
		}
		containers[short] = NetworkContainerEndpoint{
			Name:        c.Name,
			IPv4Address: c.IPv4Address,
			IPv6Address: c.IPv6Address,
			MacAddress:  c.MacAddress,
		}
	}

	nid := raw.ID
	if len(nid) > 12 {
		nid = nid[:12]
	}

	opts := raw.Options
	if opts == nil {
		opts = make(map[string]string)
	}
	labels := raw.Labels
	if labels == nil {
		labels = make(map[string]string)
	}

	return &NetworkDetail{
		ID:         nid,
		Name:       raw.Name,
		Driver:     raw.Driver,
		Scope:      raw.Scope,
		Subnet:     subnet,
		Gateway:    gateway,
		Internal:   raw.Internal,
		EnableIPv6: raw.EnableIPv6,
		IPAM:       ipamConfigs,
		IPAMDriver: raw.IPAM.Driver,
		Containers: containers,
		Options:    opts,
		Labels:     labels,
		Created:    raw.Created,
	}, nil
}

// CreateNetwork creates a new Docker network.
func (s *DockerService) CreateNetwork(req CreateNetworkRequest) (*Network, error) {
	body := map[string]any{
		"Name":     req.Name,
		"Driver":   req.Driver,
		"Internal": req.Internal,
	}
	if req.Subnet != "" || req.Gateway != "" {
		ipamConfig := map[string]string{}
		if req.Subnet != "" {
			ipamConfig["Subnet"] = req.Subnet
		}
		if req.Gateway != "" {
			ipamConfig["Gateway"] = req.Gateway
		}
		body["IPAM"] = map[string]any{
			"Config": []map[string]string{ipamConfig},
		}
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("create network marshal: %w", err)
	}

	resp, err := s.post("/networks/create", string(payload))
	if err != nil {
		return nil, fmt.Errorf("create network: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return nil, s.readError(resp)
	}

	var result struct {
		ID string `json:"Id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("create network decode: %w", err)
	}

	nid := result.ID
	if len(nid) > 12 {
		nid = nid[:12]
	}

	logger.Info().Str("network", nid).Str("name", req.Name).Msg("network created")
	return &Network{
		ID:     nid,
		Name:   req.Name,
		Driver: req.Driver,
		Scope:  "local",
	}, nil
}

// RemoveNetwork removes a Docker network.
func (s *DockerService) RemoveNetwork(id string) error {
	resp, err := s.delete(fmt.Sprintf("/networks/%s", id))
	if err != nil {
		return fmt.Errorf("remove network: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		return s.readError(resp)
	}
	logger.Info().Str("network", id).Msg("network removed")
	return nil
}

// ConnectContainerToNetwork connects a container to a network.
func (s *DockerService) ConnectContainerToNetwork(networkID, containerID string) error {
	payload, _ := json.Marshal(map[string]string{"Container": containerID})
	resp, err := s.post(fmt.Sprintf("/networks/%s/connect", networkID), string(payload))
	if err != nil {
		return fmt.Errorf("connect network: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return s.readError(resp)
	}
	logger.Info().Str("network", networkID).Str("container", containerID).Msg("container connected to network")
	return nil
}

// DisconnectContainerFromNetwork disconnects a container from a network.
func (s *DockerService) DisconnectContainerFromNetwork(networkID, containerID string) error {
	payload, _ := json.Marshal(map[string]string{"Container": containerID})
	resp, err := s.post(fmt.Sprintf("/networks/%s/disconnect", networkID), string(payload))
	if err != nil {
		return fmt.Errorf("disconnect network: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return s.readError(resp)
	}
	logger.Info().Str("network", networkID).Str("container", containerID).Msg("container disconnected from network")
	return nil
}

// PruneNetworks removes unused networks.
func (s *DockerService) PruneNetworks() ([]string, error) {
	resp, err := s.post("/networks/prune", "")
	if err != nil {
		return nil, fmt.Errorf("prune networks: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw struct {
		NetworksDeleted []string `json:"NetworksDeleted"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("prune networks decode: %w", err)
	}
	logger.Info().Int("count", len(raw.NetworksDeleted)).Msg("networks pruned")
	return raw.NetworksDeleted, nil
}

// ---------------------------------------------------------------------------
// Volume CRUD
// ---------------------------------------------------------------------------

// InspectVolume returns detailed info about a volume.
func (s *DockerService) InspectVolume(name string) (*VolumeDetail, error) {
	resp, err := s.get(fmt.Sprintf("/volumes/%s", name))
	if err != nil {
		return nil, fmt.Errorf("inspect volume: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw struct {
		Name       string
		Driver     string
		Mountpoint string
		Labels     map[string]string
		Options    map[string]string
		CreatedAt  string
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("inspect volume decode: %w", err)
	}

	// Find containers using this volume
	usedBy := make([]string, 0)
	containers, err := s.ListContainers(true)
	if err == nil {
		for _, c := range containers {
			detail, dErr := s.GetContainer(c.ID)
			if dErr == nil {
				for _, m := range detail.Mounts {
					if m.Type == "volume" && m.Source == raw.Name {
						usedBy = append(usedBy, c.Name)
						break
					}
				}
			}
		}
	}

	return &VolumeDetail{
		Name:       raw.Name,
		Driver:     raw.Driver,
		Mountpoint: raw.Mountpoint,
		Labels:     raw.Labels,
		Options:    raw.Options,
		CreatedAt:  raw.CreatedAt,
		UsedBy:     usedBy,
	}, nil
}

// CreateVolume creates a new Docker volume.
func (s *DockerService) CreateVolume(req CreateVolumeRequest) (*Volume, error) {
	body := map[string]any{
		"Name":   req.Name,
		"Driver": req.Driver,
	}
	if len(req.Labels) > 0 {
		body["Labels"] = req.Labels
	}
	if len(req.Options) > 0 {
		body["DriverOpts"] = req.Options
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("create volume marshal: %w", err)
	}

	resp, err := s.post("/volumes/create", string(payload))
	if err != nil {
		return nil, fmt.Errorf("create volume: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return nil, s.readError(resp)
	}

	var result struct {
		Name       string
		Driver     string
		Mountpoint string
		CreatedAt  string
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("create volume decode: %w", err)
	}

	logger.Info().Str("volume", result.Name).Msg("volume created")
	return &Volume{
		Name:       result.Name,
		Driver:     result.Driver,
		Mountpoint: result.Mountpoint,
		CreatedAt:  result.CreatedAt,
	}, nil
}

// RemoveVolume removes a Docker volume.
func (s *DockerService) RemoveVolume(name string, force bool) error {
	path := fmt.Sprintf("/volumes/%s", name)
	if force {
		path += "?force=true"
	}
	resp, err := s.delete(path)
	if err != nil {
		return fmt.Errorf("remove volume: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		return s.readError(resp)
	}
	logger.Info().Str("volume", name).Msg("volume removed")
	return nil
}

// PruneVolumes removes unused volumes.
func (s *DockerService) PruneVolumes() (int64, error) {
	resp, err := s.post("/volumes/prune", "")
	if err != nil {
		return 0, fmt.Errorf("prune volumes: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, s.readError(resp)
	}

	var raw struct {
		SpaceReclaimed int64 `json:"SpaceReclaimed"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return 0, fmt.Errorf("prune volumes decode: %w", err)
	}
	logger.Info().Int64("reclaimed", raw.SpaceReclaimed).Msg("volumes pruned")
	return raw.SpaceReclaimed, nil
}

// ---------------------------------------------------------------------------
// System disk usage
// ---------------------------------------------------------------------------

// GetSystemDiskUsage returns Docker system disk usage.
func (s *DockerService) GetSystemDiskUsage() (*SystemDiskUsage, error) {
	resp, err := s.get("/system/df")
	if err != nil {
		return nil, fmt.Errorf("system df: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw struct {
		Images []struct {
			Size int64 `json:"Size"`
		} `json:"Images"`
		Containers []struct {
			SizeRootFs int64 `json:"SizeRootFs"`
		} `json:"Containers"`
		Volumes []struct {
			UsageData struct {
				Size int64 `json:"Size"`
			} `json:"UsageData"`
		} `json:"Volumes"`
		BuildCache []struct {
			Size int64 `json:"Size"`
		} `json:"BuildCache"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("system df decode: %w", err)
	}

	du := &SystemDiskUsage{
		ImagesCount:     len(raw.Images),
		ContainersCount: len(raw.Containers),
		VolumesCount:    len(raw.Volumes),
	}
	for _, img := range raw.Images {
		du.ImagesSize += img.Size
	}
	for _, c := range raw.Containers {
		du.ContainersSize += c.SizeRootFs
	}
	for _, v := range raw.Volumes {
		du.VolumesSize += v.UsageData.Size
	}
	for _, b := range raw.BuildCache {
		du.BuildCacheSize += b.Size
	}
	return du, nil
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

func (s *DockerService) apiURL(path string) string {
	return fmt.Sprintf("http://localhost/%s%s", dockerAPIVersion, path)
}

func (s *DockerService) get(path string) (*http.Response, error) {
	return s.client.Get(s.apiURL(path))
}

func (s *DockerService) post(path, body string) (*http.Response, error) {
	return s.client.Post(s.apiURL(path), "application/json", strings.NewReader(body))
}

func (s *DockerService) delete(path string) (*http.Response, error) {
	req, err := http.NewRequest(http.MethodDelete, s.apiURL(path), nil)
	if err != nil {
		return nil, err
	}
	return s.client.Do(req)
}

func (s *DockerService) readError(resp *http.Response) error {
	body, _ := io.ReadAll(resp.Body)

	var msg struct {
		Message string `json:"message"`
	}
	if json.Unmarshal(body, &msg) == nil && msg.Message != "" {
		return fmt.Errorf("docker API %d: %s", resp.StatusCode, msg.Message)
	}
	return fmt.Errorf("docker API %d: %s", resp.StatusCode, string(body))
}

// stripDockerLogHeaders removes the 8-byte multiplexed stream header from
// each frame in Docker container logs.
func stripDockerLogHeaders(data []byte) string {
	var b strings.Builder
	for len(data) >= 8 {
		// Bytes 4-7 are the frame size (big-endian uint32).
		size := int(data[4])<<24 | int(data[5])<<16 | int(data[6])<<8 | int(data[7])
		data = data[8:]
		if size > len(data) {
			size = len(data)
		}
		b.Write(data[:size])
		data = data[size:]
	}
	if b.Len() == 0 {
		return string(data)
	}
	return b.String()
}

// ---------------------------------------------------------------------------
// Docker daemon management
// ---------------------------------------------------------------------------

// RestartDocker restarts the Docker daemon via systemctl.
func (s *DockerService) RestartDocker() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	return s.execSystemctl(ctx, "restart")
}

// StopDocker stops the Docker daemon via systemctl.
func (s *DockerService) StopDocker() error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return s.execSystemctl(ctx, "stop")
}

func (s *DockerService) execSystemctl(ctx context.Context, action string) error {
	cmd := exec.CommandContext(ctx, "systemctl", action, "docker")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("systemctl %s docker failed: %s — %w", action, string(out), err)
	}
	return nil
}

// GetDaemonConfig reads /etc/docker/daemon.json and returns registry mirrors.
func (s *DockerService) GetDaemonConfig() ([]string, error) {
	data, err := os.ReadFile("/etc/docker/daemon.json")
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	mirrors, _ := cfg["registry-mirrors"].([]interface{})
	result := make([]string, 0, len(mirrors))
	for _, m := range mirrors {
		if s, ok := m.(string); ok {
			result = append(result, s)
		}
	}
	return result, nil
}

// ---------------------------------------------------------------------------
// Cleanup helpers — used by DockerCleanupService
// ---------------------------------------------------------------------------

// PruneContainers removes all stopped containers.
// Returns (count removed, space reclaimed in bytes, error).
func (s *DockerService) PruneContainers() (int, int64, error) {
	resp, err := s.post("/containers/prune", "")
	if err != nil {
		return 0, 0, fmt.Errorf("prune containers: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, 0, s.readError(resp)
	}

	var raw struct {
		ContainersDeleted []string `json:"ContainersDeleted"`
		SpaceReclaimed    int64    `json:"SpaceReclaimed"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return 0, 0, fmt.Errorf("prune containers decode: %w", err)
	}
	logger.Info().Int("count", len(raw.ContainersDeleted)).Int64("reclaimed", raw.SpaceReclaimed).Msg("containers pruned")
	return len(raw.ContainersDeleted), raw.SpaceReclaimed, nil
}

// PruneBuildCache removes Docker build cache.
func (s *DockerService) PruneBuildCache() (int64, error) {
	resp, err := s.post("/build/prune", "")
	if err != nil {
		return 0, fmt.Errorf("prune build cache: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, s.readError(resp)
	}

	var raw struct {
		SpaceReclaimed int64 `json:"SpaceReclaimed"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return 0, fmt.Errorf("prune build cache decode: %w", err)
	}
	logger.Info().Int64("reclaimed", raw.SpaceReclaimed).Msg("build cache pruned")
	return raw.SpaceReclaimed, nil
}

// ContainerSummaryForCleanup is a lightweight container view for dry-run display.
type ContainerSummaryForCleanup struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Created int64  `json:"created"`
	State   string `json:"state"`
}

// ListStoppedContainers returns all containers in the exited/dead state.
func (s *DockerService) ListStoppedContainers() ([]ContainerSummaryForCleanup, error) {
	resp, err := s.get(`/containers/json?filters={"status":["exited","dead"]}&all=true`)
	if err != nil {
		return nil, fmt.Errorf("list stopped containers: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw []struct {
		ID      string   `json:"Id"`
		Names   []string `json:"Names"`
		Created int64    `json:"Created"`
		State   string   `json:"State"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("list stopped containers decode: %w", err)
	}

	result := make([]ContainerSummaryForCleanup, 0, len(raw))
	for _, c := range raw {
		name := c.ID[:12]
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		result = append(result, ContainerSummaryForCleanup{
			ID:      c.ID[:12],
			Name:    name,
			Created: c.Created,
			State:   c.State,
		})
	}
	return result, nil
}

// ImageSummaryForCleanup is a lightweight image view for dry-run display.
type ImageSummaryForCleanup struct {
	ID   string   `json:"id"`
	Tags []string `json:"tags"`
	Size int64    `json:"size"`
}

// ListDanglingImages returns images with no tags (dangling).
func (s *DockerService) ListDanglingImages() ([]ImageSummaryForCleanup, error) {
	resp, err := s.get(`/images/json?filters={"dangling":["true"]}`)
	if err != nil {
		return nil, fmt.Errorf("list dangling images: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw []struct {
		ID       string   `json:"Id"`
		RepoTags []string `json:"RepoTags"`
		Size     int64    `json:"Size"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("list dangling images decode: %w", err)
	}

	result := make([]ImageSummaryForCleanup, 0, len(raw))
	for _, img := range raw {
		id := img.ID
		if len(id) > 19 {
			id = id[7:19] // strip "sha256:" prefix, take 12 chars
		}
		result = append(result, ImageSummaryForCleanup{
			ID:   id,
			Tags: img.RepoTags,
			Size: img.Size,
		})
	}
	return result, nil
}

// ListUnusedVolumeNames returns names of volumes not used by any container.
func (s *DockerService) ListUnusedVolumeNames() ([]string, error) {
	resp, err := s.get(`/volumes?filters={"dangling":["true"]}`)
	if err != nil {
		return nil, fmt.Errorf("list unused volumes: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, s.readError(resp)
	}

	var raw struct {
		Volumes []struct {
			Name string `json:"Name"`
		} `json:"Volumes"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("list unused volumes decode: %w", err)
	}

	names := make([]string, 0, len(raw.Volumes))
	for _, v := range raw.Volumes {
		names = append(names, v.Name)
	}
	return names, nil
}

// SaveDaemonConfig writes registry mirrors to /etc/docker/daemon.json,
// preserving other fields if the file already exists.
func (s *DockerService) SaveDaemonConfig(mirrors []string) error {
	cfg := make(map[string]interface{})

	// Read existing config if present
	data, err := os.ReadFile("/etc/docker/daemon.json")
	if err == nil {
		json.Unmarshal(data, &cfg)
	}

	if len(mirrors) == 0 {
		delete(cfg, "registry-mirrors")
	} else {
		cfg["registry-mirrors"] = mirrors
	}

	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	// Ensure directory exists
	os.MkdirAll("/etc/docker", 0755)
	return os.WriteFile("/etc/docker/daemon.json", out, 0644)
}
