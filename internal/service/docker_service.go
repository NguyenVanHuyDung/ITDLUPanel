package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
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
	ID     string `json:"id"`
	Name   string `json:"name"`
	Driver string `json:"driver"`
	Scope  string `json:"scope"`
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

	// Volumes / Binds.
	var binds []string
	for _, v := range req.Volumes {
		binds = append(binds, v)
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
		ID     string `json:"Id"`
		Name   string `json:"Name"`
		Driver string `json:"Driver"`
		Scope  string `json:"Scope"`
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
		networks = append(networks, &Network{
			ID:     id,
			Name:   n.Name,
			Driver: n.Driver,
			Scope:  n.Scope,
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
