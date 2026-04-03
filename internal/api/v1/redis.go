package v1

import (
	"strconv"

	"github.com/gin-gonic/gin"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/pkg/validator"
	"github.com/ITDLUPanel/panel/internal/service"
)

// RedisHandler handles Redis management API endpoints.
type RedisHandler struct {
	redisService *service.RedisService
}

// NewRedisHandler creates a new RedisHandler.
func NewRedisHandler(redisService *service.RedisService) *RedisHandler {
	return &RedisHandler{redisService: redisService}
}

// RegisterRoutes registers Redis management routes.
func (h *RedisHandler) RegisterRoutes(rg *gin.RouterGroup, authMW gin.HandlerFunc, rbac func(string) gin.HandlerFunc) {
	redis := rg.Group("/redis")
	redis.Use(authMW)
	{
		redis.GET("/info", rbac("software.read"), h.GetInfo)
		redis.GET("/config", rbac("software.read"), h.GetConfig)
		redis.PUT("/config", rbac("software.manage"), h.SetConfig)
		redis.GET("/config-file", rbac("software.read"), h.GetConfigFile)
		redis.PUT("/config-file", rbac("software.manage"), h.SaveConfigFile)
		redis.GET("/clients", rbac("software.read"), h.GetClients)
		redis.DELETE("/clients/:id", rbac("software.manage"), h.KillClient)
		redis.POST("/flush", rbac("software.manage"), h.FlushDB)
		redis.GET("/dbsize", rbac("software.read"), h.GetDBSize)
		redis.GET("/slowlog", rbac("software.read"), h.GetSlowLog)
		redis.GET("/memory", rbac("software.read"), h.GetMemoryStats)
		redis.PUT("/password", rbac("software.manage"), h.SetPassword)
		redis.GET("/persistence", rbac("software.read"), h.GetPersistence)
	}
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// GetInfo returns Redis server information.
func (h *RedisHandler) GetInfo(c *gin.Context) {
	info, err := h.redisService.GetInfo()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, info)
}

// GetConfig returns all Redis runtime configuration parameters.
func (h *RedisHandler) GetConfig(c *gin.Context) {
	cfg, err := h.redisService.GetConfig()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, cfg)
}

type setRedisConfigRequest struct {
	Key   string `json:"key" validate:"required"`
	Value string `json:"value"`
}

// SetConfig sets a Redis configuration parameter.
func (h *RedisHandler) SetConfig(c *gin.Context) {
	var req setRedisConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if errs := validator.Validate(req); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	if err := h.redisService.SetConfig(req.Key, req.Value); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "config updated"})
}

// GetConfigFile returns the raw Redis configuration file content.
func (h *RedisHandler) GetConfigFile(c *gin.Context) {
	content, err := h.redisService.GetConfigFile()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, gin.H{"content": content})
}

type saveRedisConfigFileRequest struct {
	Content string `json:"content" validate:"required"`
}

// SaveConfigFile writes the Redis configuration file and reloads the service.
func (h *RedisHandler) SaveConfigFile(c *gin.Context) {
	var req saveRedisConfigFileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if errs := validator.Validate(req); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	if err := h.redisService.SaveConfigFile(req.Content); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "config file saved and service reloaded"})
}

// GetClients returns the list of connected Redis clients.
func (h *RedisHandler) GetClients(c *gin.Context) {
	clients, err := h.redisService.GetClients()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, clients)
}

// KillClient kills a connected Redis client by ID.
func (h *RedisHandler) KillClient(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "client id is required"))
		return
	}

	if err := h.redisService.KillClient(id); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "client killed"})
}

type flushRedisRequest struct {
	DB  *int `json:"db"`
	All bool `json:"all"`
}

// FlushDB flushes a specific Redis database or all databases.
func (h *RedisHandler) FlushDB(c *gin.Context) {
	var req flushRedisRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if req.All {
		if err := h.redisService.FlushAll(); err != nil {
			response.Error(c, err)
			return
		}
		response.Success(c, gin.H{"message": "all databases flushed"})
		return
	}

	if req.DB == nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "db", Message: "db number is required when all is false"},
		})
		return
	}

	if err := h.redisService.FlushDB(*req.DB); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "database flushed"})
}

// GetDBSize returns key counts per Redis database.
func (h *RedisHandler) GetDBSize(c *gin.Context) {
	sizes, err := h.redisService.GetDBSize()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, sizes)
}

// GetSlowLog returns Redis slow log entries.
func (h *RedisHandler) GetSlowLog(c *gin.Context) {
	countStr := c.DefaultQuery("count", "10")
	count, err := strconv.Atoi(countStr)
	if err != nil || count < 1 {
		count = 10
	}
	if count > 128 {
		count = 128
	}

	logs, err := h.redisService.GetSlowLog(count)
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, logs)
}

// GetMemoryStats returns Redis memory usage statistics.
func (h *RedisHandler) GetMemoryStats(c *gin.Context) {
	stats, err := h.redisService.GetMemoryStats()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, stats)
}

type setRedisPasswordRequest struct {
	Password string `json:"password"`
}

// SetPassword updates the Redis requirepass configuration.
func (h *RedisHandler) SetPassword(c *gin.Context) {
	var req setRedisPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "body", Message: "invalid request body"},
		})
		return
	}

	if err := h.redisService.SetPassword(req.Password); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{"message": "redis password updated"})
}

// GetPersistence returns Redis persistence (RDB/AOF) information.
func (h *RedisHandler) GetPersistence(c *gin.Context) {
	info, err := h.redisService.GetPersistenceInfo()
	if err != nil {
		response.Error(c, err)
		return
	}
	response.Success(c, info)
}
