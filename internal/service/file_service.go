package service

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"os"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// FileInfo describes a file or directory entry.
type FileInfo struct {
	Name       string    `json:"name"`
	Path       string    `json:"path"`
	Size       int64     `json:"size"`
	Mode       string    `json:"mode"`
	ModeOctal  string    `json:"mode_octal"`
	IsDir      bool      `json:"is_dir"`
	Owner      string    `json:"owner"`
	Group      string    `json:"group"`
	ModTime    time.Time `json:"mod_time"`
	IsSymlink  bool      `json:"is_symlink"`
	LinkTarget string    `json:"link_target,omitempty"`
	MimeType   string    `json:"mime_type,omitempty"`
}

// FilePermInfo holds permission and ownership details for a file.
type FilePermInfo struct {
	Path      string `json:"path"`
	Mode      string `json:"mode"`
	ModeOctal string `json:"mode_octal"`
	Owner     string `json:"owner"`
	Group     string `json:"group"`
	UID       uint32 `json:"uid"`
	GID       uint32 `json:"gid"`
}

// FileService provides file management operations.
type FileService struct{}

// NewFileService creates a new FileService.
func NewFileService() *FileService {
	return &FileService{}
}

// ── Path security ──────────────────────────────────────────────────────

// validatePath ensures the path is safe: absolute, no traversal, no null bytes.
func validatePath(path string) error {
	if path == "" {
		return apperrors.New(apperrors.ErrValidation, "path is required")
	}
	if strings.Contains(path, "\x00") {
		return apperrors.New(apperrors.ErrValidation, "path contains null bytes")
	}
	cleaned := filepath.Clean(path)
	if !filepath.IsAbs(cleaned) {
		return apperrors.New(apperrors.ErrValidation, "path must be absolute")
	}
	if strings.Contains(cleaned, "..") {
		return apperrors.New(apperrors.ErrValidation, "path traversal is not allowed")
	}
	return nil
}

// safePath cleans and validates a path, returning the cleaned version.
func safePath(path string) (string, error) {
	if err := validatePath(path); err != nil {
		return "", err
	}
	return filepath.Clean(path), nil
}

// ── Helpers ────────────────────────────────────────────────────────────

// buildFileInfo creates a FileInfo from an os.FileInfo and its full path.
func buildFileInfo(fi os.FileInfo, fullPath string) *FileInfo {
	info := &FileInfo{
		Name:      fi.Name(),
		Path:      fullPath,
		Size:      fi.Size(),
		Mode:      fi.Mode().String(),
		ModeOctal: fmt.Sprintf("0%o", fi.Mode().Perm()),
		IsDir:     fi.IsDir(),
		ModTime:   fi.ModTime(),
	}

	// Owner and group from syscall.
	if stat, ok := fi.Sys().(*syscall.Stat_t); ok {
		info.Owner = strconv.FormatUint(uint64(stat.Uid), 10)
		info.Group = strconv.FormatUint(uint64(stat.Gid), 10)
		if u, err := user.LookupId(info.Owner); err == nil {
			info.Owner = u.Username
		}
		if g, err := user.LookupGroupId(info.Group); err == nil {
			info.Group = g.Name
		}
	}

	// Symlink detection.
	if fi.Mode()&os.ModeSymlink != 0 {
		info.IsSymlink = true
		if target, err := os.Readlink(fullPath); err == nil {
			info.LinkTarget = target
		}
	}

	// MIME type for regular files.
	if !fi.IsDir() {
		ext := filepath.Ext(fi.Name())
		if mt := mime.TypeByExtension(ext); mt != "" {
			info.MimeType = mt
		}
	}

	return info
}

// ── Directory listing ──────────────────────────────────────────────────

// List returns the contents of a directory.
func (s *FileService) List(path string, showHidden bool) ([]*FileInfo, error) {
	cleanPath, err := safePath(path)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(cleanPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, apperrors.New(apperrors.ErrNotFound, "directory not found")
		}
		if os.IsPermission(err) {
			return nil, apperrors.New(apperrors.ErrForbidden, "permission denied")
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read directory")
	}

	var result []*FileInfo
	for _, entry := range entries {
		if !showHidden && strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		fullPath := filepath.Join(cleanPath, entry.Name())

		// Use Lstat to detect symlinks.
		fi, err := os.Lstat(fullPath)
		if err != nil {
			continue
		}
		result = append(result, buildFileInfo(fi, fullPath))
	}

	return result, nil
}

// Search searches for files matching a glob pattern under the given path.
func (s *FileService) Search(path, pattern string) ([]*FileInfo, error) {
	cleanPath, err := safePath(path)
	if err != nil {
		return nil, err
	}
	if pattern == "" {
		return nil, apperrors.New(apperrors.ErrValidation, "search pattern is required")
	}

	var results []*FileInfo
	_ = filepath.WalkDir(cleanPath, func(p string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil // skip entries we cannot read
		}
		matched, _ := filepath.Match(pattern, d.Name())
		if !matched {
			return nil
		}
		fi, err := os.Lstat(p)
		if err != nil {
			return nil
		}
		results = append(results, buildFileInfo(fi, p))
		// Limit results to prevent runaway searches.
		if len(results) >= 1000 {
			return filepath.SkipAll
		}
		return nil
	})

	return results, nil
}

// ContentSearchResult holds a file that matched content search along with matching lines.
type ContentSearchResult struct {
	*FileInfo
	MatchLines []ContentMatch `json:"match_lines,omitempty"`
}

// ContentMatch is a single matching line inside a file.
type ContentMatch struct {
	Line    int    `json:"line"`
	Content string `json:"content"`
}

// SearchContent searches for files whose content contains the given pattern (case-insensitive substring).
// It walks the directory tree, reads text files, and returns files with matching lines.
func (s *FileService) SearchContent(path, pattern string) ([]*ContentSearchResult, error) {
	cleanPath, err := safePath(path)
	if err != nil {
		return nil, err
	}
	if pattern == "" {
		return nil, apperrors.New(apperrors.ErrValidation, "search pattern is required")
	}

	lowerPattern := strings.ToLower(pattern)
	var results []*ContentSearchResult

	_ = filepath.WalkDir(cleanPath, func(p string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if d.IsDir() {
			return nil
		}
		// Skip binary/large files
		fi, err := d.Info()
		if err != nil {
			return nil
		}
		if fi.Size() > 10*1024*1024 { // skip files > 10MB
			return nil
		}

		data, err := os.ReadFile(p)
		if err != nil {
			return nil
		}

		// Quick binary check: if first 512 bytes contain null byte, skip
		checkLen := len(data)
		if checkLen > 512 {
			checkLen = 512
		}
		for _, b := range data[:checkLen] {
			if b == 0 {
				return nil // binary file
			}
		}

		lines := strings.Split(string(data), "\n")
		var matches []ContentMatch
		for i, line := range lines {
			if strings.Contains(strings.ToLower(line), lowerPattern) {
				content := line
				if len(content) > 200 {
					content = content[:200] + "..."
				}
				matches = append(matches, ContentMatch{Line: i + 1, Content: content})
				if len(matches) >= 5 { // max 5 matches per file
					break
				}
			}
		}

		if len(matches) > 0 {
			results = append(results, &ContentSearchResult{
				FileInfo:   buildFileInfo(fi, p),
				MatchLines: matches,
			})
		}

		if len(results) >= 200 { // limit total results
			return filepath.SkipAll
		}
		return nil
	})

	return results, nil
}

// CalculateDirSize walks a directory tree and returns its total size in bytes.
func (s *FileService) CalculateDirSize(path string) (int64, error) {
	cleanPath, err := safePath(path)
	if err != nil {
		return 0, err
	}
	fi, err := os.Stat(cleanPath)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, apperrors.New(apperrors.ErrNotFound, "path not found: "+path)
		}
		return 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to stat path")
	}
	if !fi.IsDir() {
		return fi.Size(), nil
	}

	var total int64
	_ = filepath.WalkDir(cleanPath, func(_ string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if !d.IsDir() {
			info, err := d.Info()
			if err == nil {
				total += info.Size()
			}
		}
		return nil
	})
	return total, nil
}

// ── File CRUD ──────────────────────────────────────────────────────────

// ReadFile returns the contents of a file. For safety it caps reads at 10 MB.
func (s *FileService) ReadFile(path string) ([]byte, error) {
	cleanPath, err := safePath(path)
	if err != nil {
		return nil, err
	}

	fi, err := os.Stat(cleanPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, apperrors.New(apperrors.ErrNotFound, "file not found")
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to stat file")
	}
	if fi.IsDir() {
		return nil, apperrors.New(apperrors.ErrValidation, "path is a directory, not a file")
	}

	const maxReadSize = 10 << 20 // 10 MB
	if fi.Size() > maxReadSize {
		return nil, apperrors.New(apperrors.ErrValidation, "file is too large to read (max 10 MB)")
	}

	data, err := os.ReadFile(cleanPath)
	if err != nil {
		if os.IsPermission(err) {
			return nil, apperrors.New(apperrors.ErrForbidden, "permission denied")
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to read file")
	}
	return data, nil
}

// WriteFile writes content to a file, creating or truncating it.
func (s *FileService) WriteFile(path string, content []byte) error {
	cleanPath, err := safePath(path)
	if err != nil {
		return err
	}

	dir := filepath.Dir(cleanPath)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return apperrors.New(apperrors.ErrNotFound, "parent directory does not exist")
	}

	if err := os.WriteFile(cleanPath, content, 0644); err != nil {
		if os.IsPermission(err) {
			return apperrors.New(apperrors.ErrForbidden, "permission denied")
		}
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write file")
	}

	logger.Info().Str("path", cleanPath).Msg("file written")
	return nil
}

// CreateFile creates a new empty file. It fails if the file already exists.
func (s *FileService) CreateFile(path string) error {
	cleanPath, err := safePath(path)
	if err != nil {
		return err
	}

	if _, err := os.Stat(cleanPath); err == nil {
		return apperrors.New(apperrors.ErrConflict, "file already exists")
	}

	f, err := os.OpenFile(cleanPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		if os.IsPermission(err) {
			return apperrors.New(apperrors.ErrForbidden, "permission denied")
		}
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create file")
	}
	f.Close()

	logger.Info().Str("path", cleanPath).Msg("file created")
	return nil
}

// CreateDir creates a directory (including parent directories).
func (s *FileService) CreateDir(path string) error {
	cleanPath, err := safePath(path)
	if err != nil {
		return err
	}

	if _, err := os.Stat(cleanPath); err == nil {
		return apperrors.New(apperrors.ErrConflict, "directory already exists")
	}

	if err := os.MkdirAll(cleanPath, 0755); err != nil {
		if os.IsPermission(err) {
			return apperrors.New(apperrors.ErrForbidden, "permission denied")
		}
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create directory")
	}

	logger.Info().Str("path", cleanPath).Msg("directory created")
	return nil
}

// ── Operations ─────────────────────────────────────────────────────────

// Rename renames (moves) a file or directory from oldPath to newPath.
func (s *FileService) Rename(oldPath, newPath string) error {
	cleanOld, err := safePath(oldPath)
	if err != nil {
		return err
	}
	cleanNew, err := safePath(newPath)
	if err != nil {
		return err
	}

	if _, err := os.Stat(cleanOld); os.IsNotExist(err) {
		return apperrors.New(apperrors.ErrNotFound, "source path not found")
	}

	if err := os.Rename(cleanOld, cleanNew); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to rename")
	}

	logger.Info().Str("old", cleanOld).Str("new", cleanNew).Msg("file renamed")
	return nil
}

// Copy copies a file or directory from src to dst.
func (s *FileService) Copy(src, dst string) error {
	cleanSrc, err := safePath(src)
	if err != nil {
		return err
	}
	cleanDst, err := safePath(dst)
	if err != nil {
		return err
	}

	fi, err := os.Stat(cleanSrc)
	if err != nil {
		if os.IsNotExist(err) {
			return apperrors.New(apperrors.ErrNotFound, "source path not found")
		}
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to stat source")
	}

	if fi.IsDir() {
		result, execErr := system.ExecWithTimeout(5*time.Minute, "cp", "-a", cleanSrc, cleanDst)
		if execErr != nil || result.ExitCode != 0 {
			msg := "failed to copy directory"
			if result != nil && result.Stderr != "" {
				msg += ": " + result.Stderr
			}
			return apperrors.New(apperrors.ErrInternal, msg)
		}
	} else {
		if err := copyFile(cleanSrc, cleanDst); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to copy file")
		}
	}

	logger.Info().Str("src", cleanSrc).Str("dst", cleanDst).Msg("file copied")
	return nil
}

// copyFile copies a single file preserving permissions.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	fi, err := in.Stat()
	if err != nil {
		return err
	}

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, fi.Mode())
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

// Move moves a file or directory from src to dst.
func (s *FileService) Move(src, dst string) error {
	cleanSrc, err := safePath(src)
	if err != nil {
		return err
	}
	cleanDst, err := safePath(dst)
	if err != nil {
		return err
	}

	if _, err := os.Stat(cleanSrc); os.IsNotExist(err) {
		return apperrors.New(apperrors.ErrNotFound, "source path not found")
	}

	// os.Rename works across same filesystem; fall back to mv for cross-device.
	if err := os.Rename(cleanSrc, cleanDst); err != nil {
		result, execErr := system.ExecWithTimeout(5*time.Minute, "mv", cleanSrc, cleanDst)
		if execErr != nil || result.ExitCode != 0 {
			msg := "failed to move"
			if result != nil && result.Stderr != "" {
				msg += ": " + result.Stderr
			}
			return apperrors.New(apperrors.ErrInternal, msg)
		}
	}

	logger.Info().Str("src", cleanSrc).Str("dst", cleanDst).Msg("file moved")
	return nil
}

// Delete removes a file or directory.
func (s *FileService) Delete(path string) error {
	cleanPath, err := safePath(path)
	if err != nil {
		return err
	}

	if _, err := os.Stat(cleanPath); os.IsNotExist(err) {
		return apperrors.New(apperrors.ErrNotFound, "path not found")
	}

	if err := os.RemoveAll(cleanPath); err != nil {
		if os.IsPermission(err) {
			return apperrors.New(apperrors.ErrForbidden, "permission denied")
		}
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to delete")
	}

	logger.Info().Str("path", cleanPath).Msg("file deleted")
	return nil
}

// BatchDelete removes multiple files/directories.
func (s *FileService) BatchDelete(paths []string) error {
	if len(paths) == 0 {
		return apperrors.New(apperrors.ErrValidation, "no paths provided")
	}

	var errs []string
	for _, p := range paths {
		if err := s.Delete(p); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", p, err))
		}
	}
	if len(errs) > 0 {
		return apperrors.New(apperrors.ErrInternal, "some deletions failed: "+strings.Join(errs, "; "))
	}
	return nil
}

// ── Permissions ────────────────────────────────────────────────────────

// GetPermissions returns permission and ownership information for a path.
func (s *FileService) GetPermissions(path string) (*FilePermInfo, error) {
	cleanPath, err := safePath(path)
	if err != nil {
		return nil, err
	}

	fi, err := os.Stat(cleanPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, apperrors.New(apperrors.ErrNotFound, "path not found")
		}
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to stat path")
	}

	info := &FilePermInfo{
		Path:      cleanPath,
		Mode:      fi.Mode().String(),
		ModeOctal: fmt.Sprintf("0%o", fi.Mode().Perm()),
	}

	if stat, ok := fi.Sys().(*syscall.Stat_t); ok {
		info.UID = stat.Uid
		info.GID = stat.Gid
		info.Owner = strconv.FormatUint(uint64(stat.Uid), 10)
		info.Group = strconv.FormatUint(uint64(stat.Gid), 10)
		if u, err := user.LookupId(info.Owner); err == nil {
			info.Owner = u.Username
		}
		if g, err := user.LookupGroupId(info.Group); err == nil {
			info.Group = g.Name
		}
	}

	return info, nil
}

// SetPermissions changes the file mode. If recursive, it applies to all children.
func (s *FileService) SetPermissions(path string, mode os.FileMode, recursive bool) error {
	cleanPath, err := safePath(path)
	if err != nil {
		return err
	}

	if _, err := os.Stat(cleanPath); os.IsNotExist(err) {
		return apperrors.New(apperrors.ErrNotFound, "path not found")
	}

	if recursive {
		modeStr := fmt.Sprintf("%o", mode)
		result, execErr := system.ExecWithTimeout(2*time.Minute, "chmod", "-R", modeStr, cleanPath)
		if execErr != nil || result.ExitCode != 0 {
			return apperrors.New(apperrors.ErrInternal, "failed to set permissions recursively")
		}
	} else {
		if err := os.Chmod(cleanPath, mode); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to set permissions")
		}
	}

	logger.Info().Str("path", cleanPath).Str("mode", fmt.Sprintf("%o", mode)).Bool("recursive", recursive).Msg("permissions changed")
	return nil
}

// SetOwner changes the owner and/or group of a path.
func (s *FileService) SetOwner(path string, owner, group string, recursive bool) error {
	cleanPath, err := safePath(path)
	if err != nil {
		return err
	}

	if _, err := os.Stat(cleanPath); os.IsNotExist(err) {
		return apperrors.New(apperrors.ErrNotFound, "path not found")
	}

	ownerGroup := owner
	if group != "" {
		ownerGroup = owner + ":" + group
	}

	args := []string{}
	if recursive {
		args = append(args, "-R")
	}
	args = append(args, ownerGroup, cleanPath)

	result, execErr := system.ExecWithTimeout(2*time.Minute, "chown", args...)
	if execErr != nil || result.ExitCode != 0 {
		msg := "failed to set owner"
		if result != nil && result.Stderr != "" {
			msg += ": " + result.Stderr
		}
		return apperrors.New(apperrors.ErrInternal, msg)
	}

	logger.Info().Str("path", cleanPath).Str("owner", ownerGroup).Bool("recursive", recursive).Msg("owner changed")
	return nil
}

// ── Compress / Decompress ──────────────────────────────────────────────

// Compress creates an archive of the given paths.
// Supported formats: "tar.gz" (default) and "zip".
func (s *FileService) Compress(paths []string, destPath string, format string) error {
	if len(paths) == 0 {
		return apperrors.New(apperrors.ErrValidation, "no paths to compress")
	}

	cleanDest, err := safePath(destPath)
	if err != nil {
		return err
	}

	// Validate all source paths first.
	cleanPaths := make([]string, 0, len(paths))
	for _, p := range paths {
		cp, err := safePath(p)
		if err != nil {
			return err
		}
		if _, err := os.Stat(cp); os.IsNotExist(err) {
			return apperrors.New(apperrors.ErrNotFound, "path not found: "+cp)
		}
		cleanPaths = append(cleanPaths, cp)
	}

	switch format {
	case "zip":
		return s.compressZip(cleanPaths, cleanDest)
	case "tar.gz", "":
		return s.compressTarGz(cleanPaths, cleanDest)
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported format: "+format+"; use tar.gz or zip")
	}
}

func (s *FileService) compressTarGz(paths []string, dest string) error {
	outFile, err := os.Create(dest)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create archive file")
	}
	defer outFile.Close()

	gw := gzip.NewWriter(outFile)
	defer gw.Close()

	tw := tar.NewWriter(gw)
	defer tw.Close()

	for _, srcPath := range paths {
		baseDir := filepath.Dir(srcPath)
		err := filepath.WalkDir(srcPath, func(file string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}

			fi, err := os.Lstat(file)
			if err != nil {
				return err
			}

			header, err := tar.FileInfoHeader(fi, "")
			if err != nil {
				return err
			}

			relPath, _ := filepath.Rel(baseDir, file)
			header.Name = relPath

			if fi.Mode()&os.ModeSymlink != 0 {
				link, err := os.Readlink(file)
				if err != nil {
					return err
				}
				header.Linkname = link
			}

			if err := tw.WriteHeader(header); err != nil {
				return err
			}

			if fi.Mode().IsRegular() {
				f, err := os.Open(file)
				if err != nil {
					return err
				}
				defer f.Close()
				if _, err := io.Copy(tw, f); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to compress: "+srcPath)
		}
	}

	logger.Info().Str("dest", dest).Int("sources", len(paths)).Msg("tar.gz archive created")
	return nil
}

func (s *FileService) compressZip(paths []string, dest string) error {
	outFile, err := os.Create(dest)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create archive file")
	}
	defer outFile.Close()

	zw := zip.NewWriter(outFile)
	defer zw.Close()

	for _, srcPath := range paths {
		baseDir := filepath.Dir(srcPath)
		err := filepath.WalkDir(srcPath, func(file string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}

			fi, err := os.Lstat(file)
			if err != nil {
				return err
			}

			// Skip symlinks in zip archives.
			if fi.Mode()&os.ModeSymlink != 0 {
				return nil
			}

			header, err := zip.FileInfoHeader(fi)
			if err != nil {
				return err
			}

			relPath, _ := filepath.Rel(baseDir, file)
			header.Name = relPath

			if fi.IsDir() {
				header.Name += "/"
			} else {
				header.Method = zip.Deflate
			}

			w, err := zw.CreateHeader(header)
			if err != nil {
				return err
			}

			if fi.Mode().IsRegular() {
				f, err := os.Open(file)
				if err != nil {
					return err
				}
				defer f.Close()
				if _, err := io.Copy(w, f); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to compress: "+srcPath)
		}
	}

	logger.Info().Str("dest", dest).Int("sources", len(paths)).Msg("zip archive created")
	return nil
}

// Decompress extracts an archive into destDir.
// Auto-detects format from the file extension.
func (s *FileService) Decompress(archivePath, destDir string) error {
	cleanArchive, err := safePath(archivePath)
	if err != nil {
		return err
	}
	cleanDest, err := safePath(destDir)
	if err != nil {
		return err
	}

	if _, err := os.Stat(cleanArchive); os.IsNotExist(err) {
		return apperrors.New(apperrors.ErrNotFound, "archive not found")
	}

	// Ensure destination directory exists.
	if err := os.MkdirAll(cleanDest, 0755); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create destination directory")
	}

	lower := strings.ToLower(cleanArchive)
	switch {
	case strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz"):
		return s.decompressTarGz(cleanArchive, cleanDest)
	case strings.HasSuffix(lower, ".zip"):
		return s.decompressZip(cleanArchive, cleanDest)
	default:
		// Fall back to system commands for other formats.
		return s.decompressWithSystem(cleanArchive, cleanDest)
	}
}

func (s *FileService) decompressTarGz(archivePath, destDir string) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to open archive")
	}
	defer f.Close()

	gr, err := gzip.NewReader(f)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create gzip reader")
	}
	defer gr.Close()

	tr := tar.NewReader(gr)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to read tar entry")
		}

		target := filepath.Join(destDir, header.Name)

		// Security: prevent path traversal within archive.
		if !strings.HasPrefix(filepath.Clean(target), filepath.Clean(destDir)+string(os.PathSeparator)) && filepath.Clean(target) != filepath.Clean(destDir) {
			return apperrors.New(apperrors.ErrValidation, "archive contains path traversal: "+header.Name)
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, os.FileMode(header.Mode)); err != nil {
				return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create directory")
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return err
			}
			if err := extractTarFile(tr, target, os.FileMode(header.Mode)); err != nil {
				return err
			}
		case tar.TypeSymlink:
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return err
			}
			_ = os.Remove(target)
			if err := os.Symlink(header.Linkname, target); err != nil {
				return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create symlink")
			}
		}
	}

	logger.Info().Str("archive", archivePath).Str("dest", destDir).Msg("tar.gz extracted")
	return nil
}

func extractTarFile(tr *tar.Reader, target string, mode os.FileMode) error {
	out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create file")
	}
	defer out.Close()

	if _, err := io.Copy(out, tr); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write file content")
	}
	return nil
}

func (s *FileService) decompressZip(archivePath, destDir string) error {
	r, err := zip.OpenReader(archivePath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to open zip archive")
	}
	defer r.Close()

	for _, f := range r.File {
		target := filepath.Join(destDir, f.Name)

		// Security: prevent path traversal.
		if !strings.HasPrefix(filepath.Clean(target), filepath.Clean(destDir)+string(os.PathSeparator)) && filepath.Clean(target) != filepath.Clean(destDir) {
			return apperrors.New(apperrors.ErrValidation, "archive contains path traversal: "+f.Name)
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, f.Mode()); err != nil {
				return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create directory")
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create parent directory")
		}

		if err := extractZipFile(f, target); err != nil {
			return err
		}
	}

	logger.Info().Str("archive", archivePath).Str("dest", destDir).Msg("zip extracted")
	return nil
}

func extractZipFile(f *zip.File, target string) error {
	rc, err := f.Open()
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to open zip entry")
	}
	defer rc.Close()

	out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode())
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create file")
	}
	defer out.Close()

	if _, err := io.Copy(out, rc); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write file content")
	}
	return nil
}

func (s *FileService) decompressWithSystem(archivePath, destDir string) error {
	lower := strings.ToLower(archivePath)
	var result *system.ExecResult
	var execErr error

	switch {
	case strings.HasSuffix(lower, ".tar.bz2") || strings.HasSuffix(lower, ".tbz2"):
		result, execErr = system.ExecWithTimeout(10*time.Minute, "tar", "xjf", archivePath, "-C", destDir)
	case strings.HasSuffix(lower, ".tar.xz") || strings.HasSuffix(lower, ".txz"):
		result, execErr = system.ExecWithTimeout(10*time.Minute, "tar", "xJf", archivePath, "-C", destDir)
	case strings.HasSuffix(lower, ".tar"):
		result, execErr = system.ExecWithTimeout(10*time.Minute, "tar", "xf", archivePath, "-C", destDir)
	case strings.HasSuffix(lower, ".gz"):
		result, execErr = system.ExecWithTimeout(10*time.Minute, "gzip", "-dk", archivePath)
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported archive format")
	}

	if execErr != nil || (result != nil && result.ExitCode != 0) {
		msg := "failed to decompress archive"
		if result != nil && result.Stderr != "" {
			msg += ": " + result.Stderr
		}
		return apperrors.New(apperrors.ErrInternal, msg)
	}

	logger.Info().Str("archive", archivePath).Str("dest", destDir).Msg("archive extracted via system command")
	return nil
}

// ── Disk usage ─────────────────────────────────────────────────────────

// GetDiskUsage returns the total size in bytes of a file or directory.
func (s *FileService) GetDiskUsage(path string) (int64, error) {
	cleanPath, err := safePath(path)
	if err != nil {
		return 0, err
	}

	fi, err := os.Stat(cleanPath)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, apperrors.New(apperrors.ErrNotFound, "path not found")
		}
		return 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to stat path")
	}

	if !fi.IsDir() {
		return fi.Size(), nil
	}

	// Use du for directories — much faster than walking in Go.
	result, execErr := system.ExecWithTimeout(2*time.Minute, "du", "-sb", cleanPath)
	if execErr != nil || result.ExitCode != 0 {
		return 0, apperrors.New(apperrors.ErrInternal, "failed to get disk usage")
	}

	parts := strings.Fields(result.Stdout)
	if len(parts) == 0 {
		return 0, apperrors.New(apperrors.ErrInternal, "unexpected du output")
	}

	size, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, apperrors.Wrap(err, apperrors.ErrInternal, "failed to parse disk usage")
	}

	return size, nil
}
