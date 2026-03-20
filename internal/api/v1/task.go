package v1

import (
	"strconv"

	"github.com/gin-gonic/gin"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/task"
)

// TaskHandler handles task-related API requests.
type TaskHandler struct {
	queue *task.Queue
}

// NewTaskHandler creates a new TaskHandler.
func NewTaskHandler(queue *task.Queue) *TaskHandler {
	return &TaskHandler{queue: queue}
}

// RegisterRoutes registers task routes on the given router group.
func (h *TaskHandler) RegisterRoutes(rg *gin.RouterGroup) {
	tasks := rg.Group("/tasks")
	{
		tasks.GET("", h.list)
		tasks.GET("/:id", h.get)
		tasks.GET("/:id/log", h.getLog)
		tasks.DELETE("/:id", h.cancel)
	}
}

// list returns a paginated list of tasks.
func (h *TaskHandler) list(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	status := c.Query("status")

	tasks, total, err := h.queue.ListTasks(page, perPage, status)
	if err != nil {
		response.Error(c, err)
		return
	}

	totalPages := int(total) / perPage
	if int(total)%perPage != 0 {
		totalPages++
	}

	response.Paginated(c, tasks, response.Pagination{
		Page:       page,
		PerPage:    perPage,
		Total:      total,
		TotalPages: totalPages,
	})
}

// get returns a single task by ID.
func (h *TaskHandler) get(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid task id"))
		return
	}

	t, err := h.queue.GetTask(id)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrNotFound, "task not found"))
		return
	}

	response.Success(c, t)
}

// getLog returns the log output for a task.
func (h *TaskHandler) getLog(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid task id"))
		return
	}

	log, err := h.queue.GetTaskLog(id)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrNotFound, "task not found"))
		return
	}

	response.Success(c, gin.H{"log": log})
}

// cancel cancels a running or pending task.
func (h *TaskHandler) cancel(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid task id"))
		return
	}

	if err := h.queue.Cancel(id); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "task cancelled"})
}
