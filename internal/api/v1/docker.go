package v1

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
)

// DockerHandler handles Docker management API requests.
type DockerHandler struct {
	dockerService       *service.DockerService
	userResourceService *service.UserResourceService
}

// dockerErr wraps a plain error into an AppError so response.Error()
// passes the actual message to the frontend instead of "internal server error".
func dockerErr(c *gin.Context, err error) {
	response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, err.Error()))
}

// NewDockerHandler creates a new DockerHandler.
func NewDockerHandler(dockerService *service.DockerService, userResourceService *service.UserResourceService) *DockerHandler {
	return &DockerHandler{dockerService: dockerService, userResourceService: userResourceService}
}

// dockerFullAccess reports whether the current request is from a user that
// bypasses per-container ownership checks (admin and operator). Such users
// see and can manage every container / image on the host.
func (h *DockerHandler) dockerFullAccess(c *gin.Context) bool {
	role, _ := c.Get("role")
	r, _ := role.(string)
	return r == "admin" || r == "operator"
}

// currentUserID returns the user_id from the auth context, or 0 if missing.
func (h *DockerHandler) currentUserID(c *gin.Context) int64 {
	v, _ := c.Get("user_id")
	uid, _ := v.(int64)
	return uid
}

// requireContainerAccess ensures the caller is allowed to act on the
// given container. Admins and operators always pass; ordinary users only
// pass if they own the container (label panel.owner=<uid>).
//
// On denial it writes a 403 response and returns false.
func (h *DockerHandler) requireContainerAccess(c *gin.Context, containerID string) bool {
	if h.dockerFullAccess(c) {
		return true
	}
	uid := h.currentUserID(c)
	if uid == 0 {
		c.AbortWithStatusJSON(http.StatusForbidden, response.Response{
			Code:    http.StatusForbidden,
			Message: "access denied",
		})
		return false
	}
	owner, err := h.dockerService.GetContainerOwner(containerID)
	if err != nil || owner != uid {
		c.AbortWithStatusJSON(http.StatusForbidden, response.Response{
			Code:    http.StatusForbidden,
			Message: "access denied to this container",
		})
		return false
	}
	return true
}

// filterOwnedContainers drops containers the current user is not allowed to
// see. Admins and operators get the full list back unchanged.
func (h *DockerHandler) filterOwnedContainers(c *gin.Context, containers []*service.Container) []*service.Container {
	if h.dockerFullAccess(c) || len(containers) == 0 {
		return containers
	}
	uid := h.currentUserID(c)
	if uid == 0 {
		return []*service.Container{}
	}
	out := make([]*service.Container, 0, len(containers))
	for _, ctr := range containers {
		if ctr.OwnerID == uid {
			out = append(out, ctr)
		}
	}
	return out
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
		docker.POST("/images/load", rbac("docker.upload"), h.loadImage)
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
	installed := h.dockerService.IsDockerInstalled()
	if !installed {
		c.JSON(http.StatusOK, response.Response{
			Code:    http.StatusOK,
			Message: "success",
			Data: gin.H{
				"installed": false,
				"running":   false,
			},
		})
		return
	}

	running := h.dockerService.IsDockerRunning()
	if !running {
		c.JSON(http.StatusOK, response.Response{
			Code:    http.StatusOK,
			Message: "success",
			Data: gin.H{
				"installed": true,
				"running":   false,
			},
		})
		return
	}

	info, err := h.dockerService.GetDockerInfo()
	if err != nil {
		dockerErr(c, err)
		return
	}

	response.Success(c, gin.H{
		"installed": true,
		"running":   true,
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
		dockerErr(c, err)
		return
	}
	response.Success(c, h.filterOwnedContainers(c, containers))
}

func (h *DockerHandler) getContainer(c *gin.Context) {
	id := c.Param("id")
	if !h.requireContainerAccess(c, id) {
		return
	}
	detail, err := h.dockerService.GetContainer(id)
	if err != nil {
		dockerErr(c, err)
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

	// The current user is recorded as the container owner. For
	// admin/operator this is still recorded (so admins can audit
	// who triggered the create) but doesn't gate visibility.
	owner := h.currentUserID(c)

	container, err := h.dockerService.CreateContainer(service.CreateContainerRequest{
		Name:          body.Name,
		Image:         body.Image,
		Ports:         body.Ports,
		Env:           body.Env,
		Volumes:       body.Volumes,
		RestartPolicy: body.RestartPolicy,
		Command:       body.Command,
		OwnerID:       owner,
	})
	if err != nil {
		dockerErr(c, err)
		return
	}

	response.Created(c, container)
}

func (h *DockerHandler) startContainer(c *gin.Context) {
	id := c.Param("id")
	if !h.requireContainerAccess(c, id) {
		return
	}
	if err := h.dockerService.StartContainer(id); err != nil {
		dockerErr(c, err)
		return
	}
	response.Success(c, gin.H{"message": "container started"})
}

func (h *DockerHandler) stopContainer(c *gin.Context) {
	id := c.Param("id")
	if !h.requireContainerAccess(c, id) {
		return
	}
	if err := h.dockerService.StopContainer(id); err != nil {
		dockerErr(c, err)
		return
	}
	response.Success(c, gin.H{"message": "container stopped"})
}

func (h *DockerHandler) restartContainer(c *gin.Context) {
	id := c.Param("id")
	if !h.requireContainerAccess(c, id) {
		return
	}
	if err := h.dockerService.RestartContainer(id); err != nil {
		dockerErr(c, err)
		return
	}
	response.Success(c, gin.H{"message": "container restarted"})
}

func (h *DockerHandler) removeContainer(c *gin.Context) {
	id := c.Param("id")
	if !h.requireContainerAccess(c, id) {
		return
	}
	force := c.Query("force") == "true"
	if err := h.dockerService.RemoveContainer(id, force); err != nil {
		dockerErr(c, err)
		return
	}
	// Best-effort cleanup of the owner resource row. We hash the
	// container ID into an int64 to fit the existing user_resources
	// schema (resource_id is INTEGER). The hash is stable for the
	// lifetime of the install.
	_ = h.userResourceService.RemoveAllForResource("docker_container", stableContainerID(id))
	response.Success(c, gin.H{"message": "container removed"})
}

func (h *DockerHandler) containerLogs(c *gin.Context) {
	id := c.Param("id")
	if !h.requireContainerAccess(c, id) {
		return
	}
	tail := 100
	if v := c.Query("tail"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			tail = parsed
		}
	}

	logs, err := h.dockerService.GetContainerLogs(id, tail)
	if err != nil {
		dockerErr(c, err)
		return
	}
	response.Success(c, gin.H{"logs": logs})
}

func (h *DockerHandler) containerStats(c *gin.Context) {
	id := c.Param("id")
	if !h.requireContainerAccess(c, id) {
		return
	}
	stats, err := h.dockerService.GetContainerStats(id)
	if err != nil {
		dockerErr(c, err)
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
		dockerErr(c, err)
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
		dockerErr(c, err)
		return
	}
	response.Success(c, gin.H{"message": "image pulled", "name": body.Name})
}

// loadImage accepts a multipart upload of a Docker image tarball (the
// output of `docker save ... > image.tar`) and loads it into the local
// Docker daemon.
//
// The "quiet" form flag toggles the daemon-side quiet mode. Repository
// and tag in the form data are optional: when both are provided the
// freshly-loaded image is also tagged as <repo>:<tag> so users can
// reference it by name when creating a container.
//
// Errors during the load are returned verbatim — the tarball itself
// is streamed straight to the Docker socket so memory usage stays
// bounded.
func (h *DockerHandler) loadImage(c *gin.Context) {
	const maxMemory = 64 << 20 // 64 MiB in memory; rest spooled to a temp file
	if err := c.Request.ParseMultipartForm(maxMemory); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "file", Message: "could not parse multipart upload: " + err.Error()},
		})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "file", Message: "a 'file' field with the tarball is required"},
		})
		return
	}
	defer file.Close()

	quiet := c.Request.FormValue("quiet") == "1" || c.Request.FormValue("quiet") == "true"

	logger.Info().
		Str("filename", header.Filename).
		Int64("size", header.Size).
		Msg("loading docker image from tarball")

	ids, err := h.dockerService.LoadImage(file, quiet)
	if err != nil {
		dockerErr(c, err)
		return
	}

	// Optional auto-tag so users can reference the image by name.
	// If the caller supplied repo+tag, retag using the resolved ID.
	repo := c.Request.FormValue("repo")
	tag := c.Request.FormValue("tag")
	if repo != "" && tag != "" && len(ids) > 0 {
		if tErr := h.dockerService.TagImage(ids[0], repo, tag); tErr != nil {
			logger.Warn().Err(tErr).Msg("auto-tag after load failed")
		}
	}

	response.Success(c, gin.H{
		"message":   "image loaded",
		"image_ids": ids,
		"filename":  header.Filename,
		"size":      header.Size,
	})
}

// stableContainerID hashes a container ID (full 64-char SHA or short 12-char
// prefix) into a stable int64 so it can be stored in the user_resources
// table whose resource_id column is INTEGER. The truncation+sign-handling
// keeps the value in the positive int64 range.
func stableContainerID(id string) int64 {
	if id == "" {
		return 0
	}
	id = stripSHA256Prefix(id)
	// Use first 15 hex chars -> fits in int63.
	if len(id) > 15 {
		id = id[:15]
	}
	v, err := strconv.ParseUint(id, 16, 64)
	if err != nil {
		return 0
	}
	// Mask off the high bit to keep the value positive (int64 range).
	return int64(v & 0x7FFFFFFFFFFFFFFF)
}

// stripSHA256Prefix removes the "sha256:" prefix Docker uses for image IDs.
func stripSHA256Prefix(id string) string {
	const p = "sha256:"
	if len(id) > len(p) && id[:len(p)] == p {
		return id[len(p):]
	}
	return id
}

func (h *DockerHandler) removeImage(c *gin.Context) {
	id := c.Param("id")
	force := c.Query("force") == "true"
	if err := h.dockerService.RemoveImage(id, force); err != nil {
		dockerErr(c, err)
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
		dockerErr(c, err)
		return
	}
	response.Success(c, networks)
}

func (h *DockerHandler) listVolumes(c *gin.Context) {
	volumes, err := h.dockerService.ListVolumes()
	if err != nil {
		dockerErr(c, err)
		return
	}
	response.Success(c, volumes)
}

// ---------------------------------------------------------------------------
// Container extensions
// ---------------------------------------------------------------------------

func (h *DockerHandler) pauseContainer(c *gin.Context) {
	id := c.Param("id")
	if !h.requireContainerAccess(c, id) {
		return
	}
	if err := h.dockerService.PauseContainer(id); err != nil {
		dockerErr(c, err)
		return
	}
	response.Success(c, gin.H{"message": "container paused"})
}

func (h *DockerHandler) unpauseContainer(c *gin.Context) {
	id := c.Param("id")
	if !h.requireContainerAccess(c, id) {
		return
	}
	if err := h.dockerService.UnpauseContainer(id); err != nil {
		dockerErr(c, err)
		return
	}
	response.Success(c, gin.H{"message": "container unpaused"})
}

type renameContainerBody struct {
	Name string `json:"name" validate:"required"`
}

func (h *DockerHandler) renameContainer(c *gin.Context) {
	id := c.Param("id")
	if !h.requireContainerAccess(c, id) {
		return
	}
	var body renameContainerBody
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "name", Message: "new name is required"},
		})
		return
	}
	if err := h.dockerService.RenameContainer(id, body.Name); err != nil {
		dockerErr(c, err)
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
		dockerErr(c, err)
		return
	}
	response.Success(c, results)
}

func (h *DockerHandler) inspectImage(c *gin.Context) {
	id := c.Param("id")
	detail, err := h.dockerService.InspectImage(id)
	if err != nil {
		dockerErr(c, err)
		return
	}
	response.Success(c, detail)
}

func (h *DockerHandler) imageHistory(c *gin.Context) {
	id := c.Param("id")
	history, err := h.dockerService.GetImageHistory(id)
	if err != nil {
		dockerErr(c, err)
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
		dockerErr(c, err)
		return
	}
	response.Success(c, gin.H{"message": "image tagged"})
}

func (h *DockerHandler) pruneImages(c *gin.Context) {
	reclaimed, err := h.dockerService.PruneImages()
	if err != nil {
		dockerErr(c, err)
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
		dockerErr(c, err)
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
		dockerErr(c, err)
		return
	}
	response.Created(c, network)
}

func (h *DockerHandler) removeNetwork(c *gin.Context) {
	id := c.Param("id")
	if err := h.dockerService.RemoveNetwork(id); err != nil {
		dockerErr(c, err)
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
		dockerErr(c, err)
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
		dockerErr(c, err)
		return
	}
	response.Success(c, gin.H{"message": "container disconnected"})
}

func (h *DockerHandler) pruneNetworks(c *gin.Context) {
	deleted, err := h.dockerService.PruneNetworks()
	if err != nil {
		dockerErr(c, err)
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
		dockerErr(c, err)
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
		dockerErr(c, err)
		return
	}
	response.Created(c, volume)
}

func (h *DockerHandler) removeVolume(c *gin.Context) {
	name := c.Param("name")
	force := c.Query("force") == "true"
	if err := h.dockerService.RemoveVolume(name, force); err != nil {
		dockerErr(c, err)
		return
	}
	response.Success(c, gin.H{"message": "volume removed"})
}

func (h *DockerHandler) pruneVolumes(c *gin.Context) {
	reclaimed, err := h.dockerService.PruneVolumes()
	if err != nil {
		dockerErr(c, err)
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
		dockerErr(c, err)
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
