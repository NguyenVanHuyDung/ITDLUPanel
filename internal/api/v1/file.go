package v1

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/pkg/response"
	"github.com/ITDLUPanel/panel/internal/pkg/validator"
	"github.com/ITDLUPanel/panel/internal/service"
)

// FileHandler handles file management API endpoints.
type FileHandler struct {
	fileService *service.FileService
}

// NewFileHandler creates a new FileHandler.
func NewFileHandler(fileService *service.FileService) *FileHandler {
	return &FileHandler{
		fileService: fileService,
	}
}

// RegisterRoutes registers file management routes (all require admin role).
func (h *FileHandler) RegisterRoutes(rg *gin.RouterGroup, authMW gin.HandlerFunc, rbac func(string) gin.HandlerFunc) {
	files := rg.Group("/files")
	files.Use(authMW)
	{
		files.GET("", rbac("files.read"), h.list)
		files.GET("/content", rbac("files.read"), h.readFile)
		files.PUT("/content", rbac("files.write"), h.writeFile)
		files.POST("/upload", rbac("files.write"), h.upload)
		files.GET("/download", rbac("files.read"), h.download)
		files.POST("/mkdir", rbac("files.write"), h.createDir)
		files.POST("/create", rbac("files.write"), h.createFile)
		files.POST("/rename", rbac("files.write"), h.rename)
		files.POST("/copy", rbac("files.write"), h.copyFile)
		files.POST("/move", rbac("files.write"), h.move)
		files.DELETE("", rbac("files.delete"), h.delete)
		files.PUT("/permissions", rbac("files.write"), h.setPermissions)
		files.PUT("/owner", rbac("files.write"), h.setOwner)
		files.POST("/compress", rbac("files.write"), h.compress)
		files.POST("/decompress", rbac("files.write"), h.decompress)
		files.GET("/search", rbac("files.read"), h.search)
		files.GET("/search-content", rbac("files.read"), h.searchContent)
		files.POST("/calculate-size", rbac("files.read"), h.calculateSize)
	}
}

// ── List directory ─────────────────────────────────────────────────────

type listQuery struct {
	Path       string `form:"path" validate:"required"`
	ShowHidden bool   `form:"show_hidden"`
}

func (h *FileHandler) list(c *gin.Context) {
	var q listQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "path", Message: "path query parameter is required"},
		})
		return
	}
	if errs := validator.Validate(q); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	items, err := h.fileService.List(q.Path, q.ShowHidden)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"path":  q.Path,
		"items": items,
	})
}

// ── Read file ──────────────────────────────────────────────────────────

type readQuery struct {
	Path string `form:"path" validate:"required"`
}

func (h *FileHandler) readFile(c *gin.Context) {
	var q readQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "path", Message: "path query parameter is required"},
		})
		return
	}
	if errs := validator.Validate(q); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	data, err := h.fileService.ReadFile(q.Path)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"path":    q.Path,
		"content": string(data),
	})
}

// ── Write file ─────────────────────────────────────────────────────────

type writeFileRequest struct {
	Path    string `json:"path" validate:"required"`
	Content string `json:"content"`
}

func (h *FileHandler) writeFile(c *gin.Context) {
	var req writeFileRequest
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

	if err := h.fileService.WriteFile(req.Path, []byte(req.Content)); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"path":    req.Path,
		"message": "file saved",
	})
}

// ── Upload ─────────────────────────────────────────────────────────────

func (h *FileHandler) upload(c *gin.Context) {
	destDir := c.Query("path")
	if destDir == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "path", Message: "destination path query parameter is required"},
		})
		return
	}

	// Security: check for path traversal BEFORE Clean resolves ".."
	if strings.Contains(destDir, "..") {
		response.ValidationError(c, []response.FieldError{
			{Field: "path", Message: "path traversal is not allowed"},
		})
		return
	}
	destDir = filepath.Clean(destDir)
	if !filepath.IsAbs(destDir) {
		response.ValidationError(c, []response.FieldError{
			{Field: "path", Message: "path must be absolute"},
		})
		return
	}

	form, err := c.MultipartForm()
	if err != nil {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "invalid multipart form"))
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		// Also try singular "file" field.
		files = form.File["file"]
	}
	if len(files) == 0 {
		response.ValidationError(c, []response.FieldError{
			{Field: "files", Message: "no files provided"},
		})
		return
	}

	var uploaded []gin.H
	for _, fh := range files {
		destPath := filepath.Join(destDir, filepath.Base(fh.Filename))

		src, err := fh.Open()
		if err != nil {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to open uploaded file"))
			return
		}

		dst, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
		if err != nil {
			src.Close()
			response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create destination file: "+destPath))
			return
		}

		written, copyErr := io.Copy(dst, src)
		src.Close()
		dst.Close()

		if copyErr != nil {
			response.Error(c, apperrors.Wrap(copyErr, apperrors.ErrInternal, "failed to write uploaded file"))
			return
		}

		logger.Info().Str("path", destPath).Int64("size", written).Msg("file uploaded")
		uploaded = append(uploaded, gin.H{
			"name": fh.Filename,
			"path": destPath,
			"size": written,
		})
	}

	response.Success(c, gin.H{
		"uploaded": uploaded,
	})
}

// ── Download ───────────────────────────────────────────────────────────

func (h *FileHandler) download(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		response.ValidationError(c, []response.FieldError{
			{Field: "path", Message: "path query parameter is required"},
		})
		return
	}

	cleanPath := filepath.Clean(path)
	fi, err := os.Stat(cleanPath)
	if err != nil {
		if os.IsNotExist(err) {
			response.Error(c, apperrors.New(apperrors.ErrNotFound, "file not found"))
		} else {
			response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to stat file"))
		}
		return
	}
	if fi.IsDir() {
		response.Error(c, apperrors.New(apperrors.ErrValidation, "cannot download a directory"))
		return
	}

	f, err := os.Open(cleanPath)
	if err != nil {
		response.Error(c, apperrors.Wrap(err, apperrors.ErrInternal, "failed to open file"))
		return
	}
	defer f.Close()

	filename := filepath.Base(cleanPath)
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Length", strconv.FormatInt(fi.Size(), 10))
	c.Header("Accept-Ranges", "bytes")

	// Support range requests for resume.
	rangeHeader := c.GetHeader("Range")
	if rangeHeader != "" {
		h.serveRange(c, f, fi.Size(), rangeHeader, filename)
		return
	}

	c.Status(http.StatusOK)
	io.Copy(c.Writer, f)
}

// serveRange handles HTTP Range requests for partial content download.
func (h *FileHandler) serveRange(c *gin.Context, f *os.File, totalSize int64, rangeHeader, filename string) {
	// Parse "bytes=start-end"
	rangeHeader = strings.TrimPrefix(rangeHeader, "bytes=")
	parts := strings.SplitN(rangeHeader, "-", 2)
	if len(parts) != 2 {
		c.Status(http.StatusRequestedRangeNotSatisfiable)
		return
	}

	var start, end int64
	var err error

	if parts[0] != "" {
		start, err = strconv.ParseInt(parts[0], 10, 64)
		if err != nil || start < 0 {
			c.Status(http.StatusRequestedRangeNotSatisfiable)
			return
		}
	}

	if parts[1] != "" {
		end, err = strconv.ParseInt(parts[1], 10, 64)
		if err != nil || end < start {
			c.Status(http.StatusRequestedRangeNotSatisfiable)
			return
		}
	} else {
		end = totalSize - 1
	}

	if start >= totalSize {
		c.Status(http.StatusRequestedRangeNotSatisfiable)
		return
	}
	if end >= totalSize {
		end = totalSize - 1
	}

	contentLength := end - start + 1
	if _, err := f.Seek(start, io.SeekStart); err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}

	c.Header("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, totalSize))
	c.Header("Content-Length", strconv.FormatInt(contentLength, 10))
	c.Status(http.StatusPartialContent)
	io.CopyN(c.Writer, f, contentLength)
}

// ── Create directory ───────────────────────────────────────────────────

type mkdirRequest struct {
	Path string `json:"path" validate:"required"`
}

func (h *FileHandler) createDir(c *gin.Context) {
	var req mkdirRequest
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

	if err := h.fileService.CreateDir(req.Path); err != nil {
		response.Error(c, err)
		return
	}

	response.Created(c, gin.H{
		"path":    req.Path,
		"message": "directory created",
	})
}

// ── Create empty file ──────────────────────────────────────────────────

type createFileRequest struct {
	Path string `json:"path" validate:"required"`
}

func (h *FileHandler) createFile(c *gin.Context) {
	var req createFileRequest
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

	if err := h.fileService.CreateFile(req.Path); err != nil {
		response.Error(c, err)
		return
	}

	response.Created(c, gin.H{
		"path":    req.Path,
		"message": "file created",
	})
}

// ── Rename ─────────────────────────────────────────────────────────────

type renameRequest struct {
	OldPath string `json:"old_path" validate:"required"`
	NewPath string `json:"new_path" validate:"required"`
}

func (h *FileHandler) rename(c *gin.Context) {
	var req renameRequest
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

	if err := h.fileService.Rename(req.OldPath, req.NewPath); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"old_path": req.OldPath,
		"new_path": req.NewPath,
		"message":  "renamed",
	})
}

// ── Copy ───────────────────────────────────────────────────────────────

type copyRequest struct {
	Src string `json:"src" validate:"required"`
	Dst string `json:"dst" validate:"required"`
}

func (h *FileHandler) copyFile(c *gin.Context) {
	var req copyRequest
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

	if err := h.fileService.Copy(req.Src, req.Dst); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"src":     req.Src,
		"dst":     req.Dst,
		"message": "copied",
	})
}

// ── Move ───────────────────────────────────────────────────────────────

type moveRequest struct {
	Src string `json:"src" validate:"required"`
	Dst string `json:"dst" validate:"required"`
}

func (h *FileHandler) move(c *gin.Context) {
	var req moveRequest
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

	if err := h.fileService.Move(req.Src, req.Dst); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"src":     req.Src,
		"dst":     req.Dst,
		"message": "moved",
	})
}

// ── Delete ─────────────────────────────────────────────────────────────

type deleteRequest struct {
	Paths []string `json:"paths" validate:"required,min=1"`
}

func (h *FileHandler) delete(c *gin.Context) {
	var req deleteRequest
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

	if err := h.fileService.BatchDelete(req.Paths); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"deleted": req.Paths,
		"message": "deleted",
	})
}

// ── Set permissions ────────────────────────────────────────────────────

type setPermissionsRequest struct {
	Path      string `json:"path" validate:"required"`
	Mode      string `json:"mode" validate:"required"`
	Recursive bool   `json:"recursive"`
}

func (h *FileHandler) setPermissions(c *gin.Context) {
	var req setPermissionsRequest
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

	mode, err := strconv.ParseUint(req.Mode, 8, 32)
	if err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "mode", Message: "mode must be a valid octal value (e.g. 0755)"},
		})
		return
	}

	if err := h.fileService.SetPermissions(req.Path, os.FileMode(mode), req.Recursive); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"path":    req.Path,
		"mode":    req.Mode,
		"message": "permissions updated",
	})
}

// ── Set owner ──────────────────────────────────────────────────────────

type setOwnerRequest struct {
	Path      string `json:"path" validate:"required"`
	Owner     string `json:"owner" validate:"required"`
	Group     string `json:"group"`
	Recursive bool   `json:"recursive"`
}

func (h *FileHandler) setOwner(c *gin.Context) {
	var req setOwnerRequest
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

	if err := h.fileService.SetOwner(req.Path, req.Owner, req.Group, req.Recursive); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"path":    req.Path,
		"owner":   req.Owner,
		"group":   req.Group,
		"message": "owner updated",
	})
}

// ── Compress ───────────────────────────────────────────────────────────

type compressRequest struct {
	Paths  []string `json:"paths" validate:"required,min=1"`
	Dest   string   `json:"dest" validate:"required"`
	Format string   `json:"format"`
}

func (h *FileHandler) compress(c *gin.Context) {
	var req compressRequest
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

	if req.Format == "" {
		req.Format = "tar.gz"
	}

	if err := h.fileService.Compress(req.Paths, req.Dest, req.Format); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"dest":    req.Dest,
		"format":  req.Format,
		"message": "compressed",
	})
}

// ── Decompress ─────────────────────────────────────────────────────────

type decompressRequest struct {
	Path string `json:"path" validate:"required"`
	Dest string `json:"dest" validate:"required"`
}

func (h *FileHandler) decompress(c *gin.Context) {
	var req decompressRequest
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

	if err := h.fileService.Decompress(req.Path, req.Dest); err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"archive": req.Path,
		"dest":    req.Dest,
		"message": "decompressed",
	})
}

// ── Search ─────────────────────────────────────────────────────────────

type searchQuery struct {
	Path    string `form:"path" validate:"required"`
	Pattern string `form:"pattern" validate:"required"`
}

func (h *FileHandler) search(c *gin.Context) {
	var q searchQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "query", Message: "path and pattern query parameters are required"},
		})
		return
	}
	if errs := validator.Validate(q); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	results, err := h.fileService.Search(q.Path, q.Pattern)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"path":    q.Path,
		"pattern": q.Pattern,
		"results": results,
	})
}

// ── Search file content ────────────────────────────────────────────────

type searchContentQuery struct {
	Path    string `form:"path" validate:"required"`
	Pattern string `form:"pattern" validate:"required"`
}

func (h *FileHandler) searchContent(c *gin.Context) {
	var q searchContentQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		response.ValidationError(c, []response.FieldError{
			{Field: "query", Message: "path and pattern query parameters are required"},
		})
		return
	}
	if errs := validator.Validate(q); errs != nil {
		response.ValidationError(c, errs)
		return
	}

	results, err := h.fileService.SearchContent(q.Path, q.Pattern)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"path":    q.Path,
		"pattern": q.Pattern,
		"results": results,
	})
}

// ── Calculate directory size ───────────────────────────────────────────

type calculateSizeRequest struct {
	Path string `json:"path" validate:"required"`
}

func (h *FileHandler) calculateSize(c *gin.Context) {
	var req calculateSizeRequest
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

	size, err := h.fileService.CalculateDirSize(req.Path)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.Success(c, gin.H{
		"path": req.Path,
		"size": size,
	})
}


