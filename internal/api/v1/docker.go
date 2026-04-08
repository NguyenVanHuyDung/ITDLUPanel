package v1

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
)

// DockerHandler handles Docker management API requests.
type DockerHandler struct {
	dockerService *service.DockerService
}

// NewDockerHandler creates a new DockerHandler.
func NewDockerHandler(dockerService *service.DockerService) *DockerHandler {
	return &DockerHandler{dockerService: dockerService}
}

// RegisterRoutes registers Docker routes on the given router group.
func (h *DockerHandler) RegisterRoutes(rg *gin.RouterGroup, authMW gin.HandlerFunc, rbac func(string) gin.HandlerFunc) {
	docker := rg.Group("/docker")
	docker.Use(authMW)
	{
		docker.GET("/info", rbac("docker.read"), h.info)

		// Containers
		docker.GET("/containers", rbac("docker.read"), h.listContainers)
		docker.POST("/containers", rbac("docker.create"), h.createContainer)
		docker.GET("/containers/:id", rbac("docker.read"), h.getContainer)
		docker.DELETE("/containers/:id", rbac("docker.create"), h.removeContainer)
		docker.POST("/containers/:id/start", rbac("docker.manage"), h.startContainer)
		docker.POST("/containers/:id/stop", rbac("docker.manage"), h.stopContainer)
		docker.POST("/containers/:id/restart", rbac("docker.manage"), h.restartContainer)
		docker.POST("/containers/:id/pause", rbac("docker.manage"), h.pauseContainer)
		docker.POST("/containers/:id/unpause", rbac("docker.manage"), h.unpauseContainer)
		docker.POST("/containers/:id/rename", rbac("docker.manage"), h.renameContainer)
		docker.GET("/containers/:id/logs", rbac("docker.read"), h.containerLogs)
		docker.GET("/containers/:id/stats", rbac("docker.read"), h.containerStats)

		// Images – static paths before parametric
		docker.GET("/images", rbac("docker.read"), h.listImages)
		docker.GET("/images/search", rbac("docker.read"), h.searchImages)
		docker.POST("/images/pull", rbac("docker.manage"), h.pullImage)
		docker.POST("/images/prune", rbac("docker.manage"), h.pruneImages)
		docker.DELETE("/images/:id", rbac("docker.manage"), h.removeImage)
		docker.GET("/images/:id/inspect", rbac("docker.read"), h.inspectImage)
		docker.GET("/images/:id/history", rbac("docker.read"), h.imageHistory)
		docker.POST("/images/:id/tag", rbac("docker.manage"), h.tagImage)

		// Networks – static paths before parametric
		docker.GET("/networks", rbac("docker.read"), h.listNetworks)
		docker.POST("/networks", rbac("docker.create"), h.createNetwork)
		docker.POST("/networks/prune", rbac("docker.manage"), h.pruneNetworks)
		docker.GET("/networks/:id", rbac("docker.read"), h.inspectNetwork)
		docker.DELETE("/networks/:id", rbac("docker.manage"), h.removeNetwork)
		docker.POST("/networks/:id/connect", rbac("docker.manage"), h.connectNetwork)
		docker.POST("/networks/:id/disconnect", rbac("docker.manage"), h.disconnectNetwork)

		// Volumes – static paths before parametric
		docker.GET("/volumes", rbac("docker.read"), h.listVolumes)
		docker.POST("/volumes", rbac("docker.create"), h.createVolume)
		docker.POST("/volumes/prune", rbac("docker.manage"), h.pruneVolumes)
		docker.GET("/volumes/:name", rbac("docker.read"), h.inspectVolume)
		docker.DELETE("/volumes/:name", rbac("docker.manage"), h.removeVolume)

		// System
		docker.GET("/system/df", rbac("docker.read"), h.systemDf)
		docker.POST("/system/restart", rbac("docker.manage"), h.restartDocker)
		docker.POST("/system/stop", rbac("docker.manage"), h.stopDocker)
		docker.GET("/system/config", rbac("docker.read"), h.getDaemonConfig)
		docker.PUT("/system/config", rbac("docker.manage"), h.saveDaemonConfig)
	}
}

// ---------------------------------------------------------------------------
// Info
// ---------------------------------------------------------------------------

func (h *DockerHandler) info(c *gin.Context) {
	if !h.dockerService.IsDockerInstalled() {
		c.JSON(http.StatusOK, response.Response{
			Code:    http.StatusOK,
			Message: "success",
			Data: gin.H{
				"installed": false,
			},
		})
		return
	}

	info, err := h.dockerService.GetDockerInfo()
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"installed": true,
		"info":      info,
	})
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

func (h *DockerHandler) listContainers(c *gin.Context) {
	all := c.Query("all") == "true"
	containers, err := h.dockerService.ListContainers(all)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, containers)
}

func (h *DockerHandler) getContainer(c *gin.Context) {
	id := c.Param("id")
	detail, err := h.dockerService.GetContainer(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, detail)
}

type createContainerBody struct {
	Name          string            `json:"name"`
	Image         string            `json:"image" validate:"required"`
	Ports         map[string]string `json:"ports"`
	Env           []string          `json:"env"`
	Volumes       []string          `json:"volumes"`
	RestartPolicy string            `json:"restart_policy"`
	Command       string            `json:"command"`
}

func (h *DockerHandler) createContainer(c *gin.Context) {
	var body createContainerBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if body.Image == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "image", Message: "image is required"},
		})
		return
	}

	container, err := h.dockerService.CreateContainer(service.CreateContainerRequest{
		Name:          body.Name,
		Image:         body.Image,
		Ports:         body.Ports,
		Env:           body.Env,
		Volumes:       body.Volumes,
		RestartPolicy: body.RestartPolicy,
		Command:       body.Command,
	})
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Created(c, container)
}

func (h *DockerHandler) startContainer(c *gin.Context) {
	id := c.Param("id")
	if err := h.dockerService.StartContainer(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "container started"})
}

func (h *DockerHandler) stopContainer(c *gin.Context) {
	id := c.Param("id")
	if err := h.dockerService.StopContainer(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "container stopped"})
}

func (h *DockerHandler) restartContainer(c *gin.Context) {
	id := c.Param("id")
	if err := h.dockerService.RestartContainer(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "container restarted"})
}

func (h *DockerHandler) removeContainer(c *gin.Context) {
	id := c.Param("id")
	force := c.Query("force") == "true"
	if err := h.dockerService.RemoveContainer(id, force); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "container removed"})
}

func (h *DockerHandler) containerLogs(c *gin.Context) {
	id := c.Param("id")
	tail := 100
	if v := c.Query("tail"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			tail = parsed
		}
	}

	logs, err := h.dockerService.GetContainerLogs(id, tail)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"logs": logs})
}

func (h *DockerHandler) containerStats(c *gin.Context) {
	id := c.Param("id")
	stats, err := h.dockerService.GetContainerStats(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, stats)
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

func (h *DockerHandler) listImages(c *gin.Context) {
	images, err := h.dockerService.ListImages()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, images)
}

type pullImageBody struct {
	Name string `json:"name" validate:"required"`
}

func (h *DockerHandler) pullImage(c *gin.Context) {
	var body pullImageBody
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "name", Message: "image name is required"},
		})
		return
	}

	if err := h.dockerService.PullImage(body.Name); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "image pulled", "name": body.Name})
}

func (h *DockerHandler) removeImage(c *gin.Context) {
	id := c.Param("id")
	force := c.Query("force") == "true"
	if err := h.dockerService.RemoveImage(id, force); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "image removed"})
}

// ---------------------------------------------------------------------------
// Networks & Volumes
// ---------------------------------------------------------------------------

func (h *DockerHandler) listNetworks(c *gin.Context) {
	networks, err := h.dockerService.ListNetworks()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, networks)
}

func (h *DockerHandler) listVolumes(c *gin.Context) {
	volumes, err := h.dockerService.ListVolumes()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, volumes)
}

// ---------------------------------------------------------------------------
// Container extensions
// ---------------------------------------------------------------------------

func (h *DockerHandler) pauseContainer(c *gin.Context) {
	id := c.Param("id")
	if err := h.dockerService.PauseContainer(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "container paused"})
}

func (h *DockerHandler) unpauseContainer(c *gin.Context) {
	id := c.Param("id")
	if err := h.dockerService.UnpauseContainer(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "container unpaused"})
}

type renameContainerBody struct {
	Name string `json:"name" validate:"required"`
}

func (h *DockerHandler) renameContainer(c *gin.Context) {
	id := c.Param("id")
	var body renameContainerBody
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "name", Message: "new name is required"},
		})
		return
	}
	if err := h.dockerService.RenameContainer(id, body.Name); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "container renamed"})
}

// ---------------------------------------------------------------------------
// Image extensions
// ---------------------------------------------------------------------------

func (h *DockerHandler) searchImages(c *gin.Context) {
	q := c.Query("q")
	if q == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "q", Message: "search query is required"},
		})
		return
	}
	results, err := h.dockerService.SearchImages(q)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, results)
}

func (h *DockerHandler) inspectImage(c *gin.Context) {
	id := c.Param("id")
	detail, err := h.dockerService.InspectImage(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, detail)
}

func (h *DockerHandler) imageHistory(c *gin.Context) {
	id := c.Param("id")
	history, err := h.dockerService.GetImageHistory(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, history)
}

type tagImageBody struct {
	Repo string `json:"repo" validate:"required"`
	Tag  string `json:"tag" validate:"required"`
}

func (h *DockerHandler) tagImage(c *gin.Context) {
	id := c.Param("id")
	var body tagImageBody
	if err := c.ShouldBindJSON(&body); err != nil || body.Repo == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "repo", Message: "repository is required"},
		})
		return
	}
	if body.Tag == "" {
		body.Tag = "latest"
	}
	if err := h.dockerService.TagImage(id, body.Repo, body.Tag); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "image tagged"})
}

func (h *DockerHandler) pruneImages(c *gin.Context) {
	reclaimed, err := h.dockerService.PruneImages()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "images pruned", "space_reclaimed": reclaimed})
}

// ---------------------------------------------------------------------------
// Network handlers
// ---------------------------------------------------------------------------

func (h *DockerHandler) inspectNetwork(c *gin.Context) {
	id := c.Param("id")
	detail, err := h.dockerService.InspectNetwork(id)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, detail)
}

type createNetworkBody struct {
	Name     string `json:"name" validate:"required"`
	Driver   string `json:"driver"`
	Subnet   string `json:"subnet"`
	Gateway  string `json:"gateway"`
	Internal bool   `json:"internal"`
}

func (h *DockerHandler) createNetwork(c *gin.Context) {
	var body createNetworkBody
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "name", Message: "network name is required"},
		})
		return
	}
	if body.Driver == "" {
		body.Driver = "bridge"
	}
	network, err := h.dockerService.CreateNetwork(service.CreateNetworkRequest{
		Name:     body.Name,
		Driver:   body.Driver,
		Subnet:   body.Subnet,
		Gateway:  body.Gateway,
		Internal: body.Internal,
	})
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, network)
}

func (h *DockerHandler) removeNetwork(c *gin.Context) {
	id := c.Param("id")
	if err := h.dockerService.RemoveNetwork(id); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "network removed"})
}

type networkConnectBody struct {
	Container string `json:"container" validate:"required"`
}

func (h *DockerHandler) connectNetwork(c *gin.Context) {
	id := c.Param("id")
	var body networkConnectBody
	if err := c.ShouldBindJSON(&body); err != nil || body.Container == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "container", Message: "container ID is required"},
		})
		return
	}
	if err := h.dockerService.ConnectContainerToNetwork(id, body.Container); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "container connected"})
}

func (h *DockerHandler) disconnectNetwork(c *gin.Context) {
	id := c.Param("id")
	var body networkConnectBody
	if err := c.ShouldBindJSON(&body); err != nil || body.Container == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "container", Message: "container ID is required"},
		})
		return
	}
	if err := h.dockerService.DisconnectContainerFromNetwork(id, body.Container); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "container disconnected"})
}

func (h *DockerHandler) pruneNetworks(c *gin.Context) {
	deleted, err := h.dockerService.PruneNetworks()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "networks pruned", "deleted": deleted})
}

// ---------------------------------------------------------------------------
// Volume handlers
// ---------------------------------------------------------------------------

func (h *DockerHandler) inspectVolume(c *gin.Context) {
	name := c.Param("name")
	detail, err := h.dockerService.InspectVolume(name)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, detail)
}

type createVolumeBody struct {
	Name    string            `json:"name" validate:"required"`
	Driver  string            `json:"driver"`
	Labels  map[string]string `json:"labels"`
	Options map[string]string `json:"driver_opts"`
}

func (h *DockerHandler) createVolume(c *gin.Context) {
	var body createVolumeBody
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "name", Message: "volume name is required"},
		})
		return
	}
	if body.Driver == "" {
		body.Driver = "local"
	}
	volume, err := h.dockerService.CreateVolume(service.CreateVolumeRequest{
		Name:    body.Name,
		Driver:  body.Driver,
		Labels:  body.Labels,
		Options: body.Options,
	})
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, volume)
}

func (h *DockerHandler) removeVolume(c *gin.Context) {
	name := c.Param("name")
	force := c.Query("force") == "true"
	if err := h.dockerService.RemoveVolume(name, force); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "volume removed"})
}

func (h *DockerHandler) pruneVolumes(c *gin.Context) {
	reclaimed, err := h.dockerService.PruneVolumes()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "volumes pruned", "space_reclaimed": reclaimed})
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

func (h *DockerHandler) systemDf(c *gin.Context) {
	du, err := h.dockerService.GetSystemDiskUsage()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, du)
}

func (h *DockerHandler) restartDocker(c *gin.Context) {
	if err := h.dockerService.RestartDocker(); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to restart Docker"))
		return
	}
	response.Success(c, gin.H{"message": "Docker daemon restarted"})
}

func (h *DockerHandler) stopDocker(c *gin.Context) {
	if err := h.dockerService.StopDocker(); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to stop Docker"))
		return
	}
	response.Success(c, gin.H{"message": "Docker daemon stopped"})
}

func (h *DockerHandler) getDaemonConfig(c *gin.Context) {
	mirrors, err := h.dockerService.GetDaemonConfig()
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read daemon config"))
		return
	}
	response.Success(c, gin.H{"mirrors": mirrors})
}

func (h *DockerHandler) saveDaemonConfig(c *gin.Context) {
	var req struct {
		Mirrors []string `json:"mirrors"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{{Field: "mirrors", Message: "mirrors must be an array of URLs"}})
		return
	}
	if err := h.dockerService.SaveDaemonConfig(req.Mirrors); err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to save daemon config"))
		return
	}
	response.Success(c, gin.H{"message": "Daemon configuration saved. Restart Docker for changes to take effect."})
}
