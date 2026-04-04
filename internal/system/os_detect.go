package system

import (
	"bufio"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
)

// OSInfo holds information about the host operating system.
type OSInfo struct {
	ID         string `json:"id"`
	Version    string `json:"version"`
	VersionID  string `json:"version_id"`
	Name       string `json:"name"`
	PkgManager string `json:"pkg_manager"`
	ServiceMgr string `json:"service_mgr"`
	Arch       string `json:"arch"`
}

var (
	cachedOS   *OSInfo
	osInitOnce sync.Once
)

// DetectOS parses /etc/os-release and returns host OS information.
func DetectOS() (*OSInfo, error) {
	info := &OSInfo{
		ServiceMgr: "systemctl",
		Arch:       runtime.GOARCH,
	}

	file, err := os.Open("/etc/os-release")
	if err != nil {
		return nil, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		value = strings.Trim(value, `"`)
		switch key {
		case "ID":
			info.ID = value
		case "VERSION":
			info.Version = value
		case "VERSION_ID":
			info.VersionID = value
		case "NAME":
			info.Name = value
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	switch info.ID {
	case "ubuntu", "debian":
		info.PkgManager = "apt"
	case "almalinux", "centos", "rocky", "fedora", "rhel":
		info.PkgManager = "dnf"
	default:
		info.PkgManager = "apt"
	}

	return info, nil
}

// GetOSInfo returns the cached OS info, detecting it on first call.
func GetOSInfo() *OSInfo {
	osInitOnce.Do(func() {
		info, err := DetectOS()
		if err != nil {
			cachedOS = &OSInfo{
				ID:         "unknown",
				PkgManager: "apt",
				ServiceMgr: "systemctl",
				Arch:       runtime.GOARCH,
			}
			return
		}
		cachedOS = info
	})
	return cachedOS
}

// IsUbuntu returns true if the host is running Ubuntu.
func IsUbuntu() bool {
	return GetOSInfo().ID == "ubuntu"
}

// IsDebian returns true if the host is running Debian.
func IsDebian() bool {
	return GetOSInfo().ID == "debian"
}

// IsAlmaLinux returns true if the host is running AlmaLinux.
func IsAlmaLinux() bool {
	return GetOSInfo().ID == "almalinux"
}

// IsRHEL returns true if the host is running any RHEL-based distro.
func IsRHEL() bool {
	id := GetOSInfo().ID
	return id == "almalinux" || id == "centos" || id == "rocky" || id == "fedora" || id == "rhel"
}

// IsAPT returns true if the system uses apt package manager.
func IsAPT() bool {
	return GetOSInfo().PkgManager == "apt"
}

// IsDNF returns true if the system uses dnf package manager.
func IsDNF() bool {
	return GetOSInfo().PkgManager == "dnf"
}

// PackageInstall returns an *exec.Cmd for installing the given packages
// using the system's native package manager.
func PackageInstall(packages ...string) *exec.Cmd {
	info := GetOSInfo()
	args := append([]string{"install", "-y"}, packages...)
	return exec.Command(info.PkgManager, args...)
}

// ServiceCommand returns an *exec.Cmd for the given systemctl action on a service.
func ServiceCommand(action, name string) *exec.Cmd {
	return exec.Command("systemctl", action, name)
}
