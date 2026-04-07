package v1

import (
	"github.com/gin-gonic/gin"

	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/service"
)

// DockerComposeHandler handles Docker Compose API requests.
type DockerComposeHandler struct {
	composeService *service.DockerComposeService
}

// NewDockerComposeHandler creates a new DockerComposeHandler.
func NewDockerComposeHandler(composeService *service.DockerComposeService) *DockerComposeHandler {
	return &DockerComposeHandler{composeService: composeService}
}

// RegisterRoutes registers Compose routes on the given router group.
func (h *DockerComposeHandler) RegisterRoutes(rg *gin.RouterGroup, authMW gin.HandlerFunc, rbac func(string) gin.HandlerFunc) {
	compose := rg.Group("/docker/compose")
	compose.Use(authMW)
	{
		compose.GET("", rbac("docker.read"), h.listProjects)
		compose.POST("", rbac("docker.create"), h.createProject)
		compose.GET("/:name", rbac("docker.read"), h.getProject)
		compose.DELETE("/:name", rbac("docker.manage"), h.removeProject)
		compose.POST("/:name/up", rbac("docker.manage"), h.up)
		compose.POST("/:name/down", rbac("docker.manage"), h.down)
		compose.POST("/:name/restart", rbac("docker.manage"), h.restart)
		compose.GET("/:name/logs", rbac("docker.read"), h.logs)
	}
}

func (h *DockerComposeHandler) listProjects(c *gin.Context) {
	projects, err := h.composeService.ListProjects()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, projects)
}

type createComposeProjectBody struct {
	Name string `json:"name" validate:"required"`
	YAML string `json:"yaml" validate:"required"`
}

func (h *DockerComposeHandler) createProject(c *gin.Context) {
	var body createComposeProjectBody
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" || body.YAML == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "name", Message: "project name and YAML are required"},
		})
		return
	}
	if err := h.composeService.CreateProject(body.Name, body.YAML); err != nil {
		response.Error(c, err)
		return
	}
	response.Created(c, gin.H{"message": "project created", "name": body.Name})
}

func (h *DockerComposeHandler) getProject(c *gin.Context) {
	name := c.Param("name")
	yaml, err := h.composeService.GetProjectYAML(name)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"name": name, "yaml": yaml})
}

func (h *DockerComposeHandler) removeProject(c *gin.Context) {
	name := c.Param("name")
	if err := h.composeService.RemoveProject(name); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "project removed"})
}

func (h *DockerComposeHandler) up(c *gin.Context) {
	name := c.Param("name")
	if err := h.composeService.Up(name); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "compose up successful"})
}

func (h *DockerComposeHandler) down(c *gin.Context) {
	name := c.Param("name")
	if err := h.composeService.Down(name); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "compose down successful"})
}

func (h *DockerComposeHandler) restart(c *gin.Context) {
	name := c.Param("name")
	if err := h.composeService.Restart(name); err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"message": "compose restart successful"})
}

func (h *DockerComposeHandler) logs(c *gin.Context) {
	name := c.Param("name")
	logs, err := h.composeService.Logs(name)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"logs": logs})
}
