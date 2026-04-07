package service

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

const composeBaseDir = "/opt/itdlupanel/docker/compose"

// ComposeProject describes a Docker Compose project.
type ComposeProject struct {
	Name        string `json:"name"`
	Status      string `json:"status"`
	ConfigFiles string `json:"config_files"`
	Running     int    `json:"running"`
	Stopped     int    `json:"stopped"`
	Created     int    `json:"created"`
}

// DockerComposeService manages Docker Compose projects.
type DockerComposeService struct{}

// NewDockerComposeService creates a new DockerComposeService.
func NewDockerComposeService() *DockerComposeService {
	return &DockerComposeService{}
}

// ListProjects lists all Docker Compose projects.
func (s *DockerComposeService) ListProjects() ([]*ComposeProject, error) {
	cmd := exec.Command("docker", "compose", "ls", "--format", "json")
	out, err := cmd.Output()
	if err != nil {
		return []*ComposeProject{}, nil
	}

	var raw []struct {
		Name        string `json:"Name"`
		Status      string `json:"Status"`
		ConfigFiles string `json:"ConfigFiles"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return []*ComposeProject{}, nil
	}

	projects := make([]*ComposeProject, 0, len(raw))
	for _, r := range raw {
		status := "unknown"
		running, stopped := 0, 0
		if strings.Contains(r.Status, "running") {
			status = "running"
		} else if strings.Contains(r.Status, "exited") || strings.Contains(r.Status, "dead") {
			status = "stopped"
		}
		// Parse running(N) from status string like "running(2)"
		if idx := strings.Index(r.Status, "running("); idx >= 0 {
			fmt.Sscanf(r.Status[idx:], "running(%d)", &running)
		}
		if idx := strings.Index(r.Status, "exited("); idx >= 0 {
			fmt.Sscanf(r.Status[idx:], "exited(%d)", &stopped)
		}
		if running > 0 && stopped > 0 {
			status = "partial"
		}

		projects = append(projects, &ComposeProject{
			Name:        r.Name,
			Status:      status,
			ConfigFiles: r.ConfigFiles,
			Running:     running,
			Stopped:     stopped,
		})
	}
	return projects, nil
}

// CreateProject creates a new Compose project with the given YAML.
func (s *DockerComposeService) CreateProject(name, yaml string) error {
	dir := filepath.Join(composeBaseDir, name)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create project dir: %w", err)
	}

	filePath := filepath.Join(dir, "docker-compose.yml")
	if err := os.WriteFile(filePath, []byte(yaml), 0644); err != nil {
		return fmt.Errorf("write compose file: %w", err)
	}

	logger.Info().Str("project", name).Msg("compose project created")
	return nil
}

// GetProjectYAML returns the YAML content of a compose project.
func (s *DockerComposeService) GetProjectYAML(name string) (string, error) {
	filePath := filepath.Join(composeBaseDir, name, "docker-compose.yml")
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("read compose file: %w", err)
	}
	return string(data), nil
}

// Up starts a compose project.
func (s *DockerComposeService) Up(name string) error {
	dir := filepath.Join(composeBaseDir, name)
	cmd := exec.Command("docker", "compose", "-f", filepath.Join(dir, "docker-compose.yml"), "-p", name, "up", "-d")
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("compose up: %s: %w", string(out), err)
	}
	logger.Info().Str("project", name).Msg("compose up")
	return nil
}

// Down stops a compose project.
func (s *DockerComposeService) Down(name string) error {
	dir := filepath.Join(composeBaseDir, name)
	cmd := exec.Command("docker", "compose", "-f", filepath.Join(dir, "docker-compose.yml"), "-p", name, "down")
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("compose down: %s: %w", string(out), err)
	}
	logger.Info().Str("project", name).Msg("compose down")
	return nil
}

// Restart restarts a compose project.
func (s *DockerComposeService) Restart(name string) error {
	dir := filepath.Join(composeBaseDir, name)
	cmd := exec.Command("docker", "compose", "-f", filepath.Join(dir, "docker-compose.yml"), "-p", name, "restart")
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("compose restart: %s: %w", string(out), err)
	}
	logger.Info().Str("project", name).Msg("compose restart")
	return nil
}

// Logs returns recent logs of a compose project.
func (s *DockerComposeService) Logs(name string) (string, error) {
	dir := filepath.Join(composeBaseDir, name)
	cmd := exec.Command("docker", "compose", "-f", filepath.Join(dir, "docker-compose.yml"), "-p", name, "logs", "--tail", "200", "--no-color")
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), nil
	}
	return string(out), nil
}

// RemoveProject removes a compose project directory.
func (s *DockerComposeService) RemoveProject(name string) error {
	// Down first
	_ = s.Down(name)

	dir := filepath.Join(composeBaseDir, name)
	if err := os.RemoveAll(dir); err != nil {
		return fmt.Errorf("remove project dir: %w", err)
	}
	logger.Info().Str("project", name).Msg("compose project removed")
	return nil
}
