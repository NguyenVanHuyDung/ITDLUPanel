package v1

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

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
func (h *DockerHandler) RegisterRoutes(rg *gin.RouterGroup, authMW, adminMW gin.HandlerFunc) {
	docker := rg.Group("/docker")
	docker.Use(authMW, adminMW)
	{
		docker.GET("/info", h.info)

		docker.GET("/containers", h.listContainers)
		docker.POST("/containers", h.createContainer)
		docker.GET("/containers/:id", h.getContainer)
		docker.DELETE("/containers/:id", h.removeContainer)
		docker.POST("/containers/:id/start", h.startContainer)
		docker.POST("/containers/:id/stop", h.stopContainer)
		docker.POST("/containers/:id/restart", h.restartContainer)
		docker.GET("/containers/:id/logs", h.containerLogs)
		docker.GET("/containers/:id/stats", h.containerStats)

		docker.GET("/images", h.listImages)
		docker.POST("/images/pull", h.pullImage)
		docker.DELETE("/images/:id", h.removeImage)

		docker.GET("/networks", h.listNetworks)
		docker.GET("/volumes", h.listVolumes)
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
