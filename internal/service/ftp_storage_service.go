package service

import (
	"database/sql"
	"fmt"
	"io"
	"os"
	"path"
	"strings"
	"time"

	"github.com/jlaffaye/ftp"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// FTPStorage represents a remote FTP storage configuration.
type FTPStorage struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	Password   string `json:"password,omitempty"`
	RemotePath string `json:"remote_path"`
	IsDefault  bool   `json:"is_default"`
	IsActive   bool   `json:"is_active"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
}

// FTPStorageService manages remote FTP storage configurations.
type FTPStorageService struct {
	db *sql.DB
}

// NewFTPStorageService creates a new FTPStorageService.
func NewFTPStorageService(db *sql.DB) *FTPStorageService {
	return &FTPStorageService{db: db}
}

// List returns all FTP storage configurations.
func (s *FTPStorageService) List() ([]*FTPStorage, error) {
	rows, err := s.db.Query(
		`SELECT id, name, host, port, username, password, remote_path,
		        is_default, is_active, created_at, updated_at
		 FROM ftp_storages ORDER BY name`)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list FTP storages")
	}
	defer rows.Close()

	var storages []*FTPStorage
	for rows.Next() {
		st := &FTPStorage{}
		var isDefault, isActive int
		if err := rows.Scan(&st.ID, &st.Name, &st.Host, &st.Port, &st.Username, &st.Password,
			&st.RemotePath, &isDefault, &isActive, &st.CreatedAt, &st.UpdatedAt); err != nil {
			continue
		}
		st.IsDefault = isDefault == 1
		st.IsActive = isActive == 1
		st.Password = "***"
		storages = append(storages, st)
	}
	return storages, nil
}

// GetByID returns a single FTP storage by ID.
func (s *FTPStorageService) GetByID(id int64) (*FTPStorage, error) {
	st := &FTPStorage{}
	var isDefault, isActive int
	err := s.db.QueryRow(
		`SELECT id, name, host, port, username, password, remote_path,
		        is_default, is_active, created_at, updated_at
		 FROM ftp_storages WHERE id = ?`, id,
	).Scan(&st.ID, &st.Name, &st.Host, &st.Port, &st.Username, &st.Password,
		&st.RemotePath, &isDefault, &isActive, &st.CreatedAt, &st.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, apperrors.New(apperrors.ErrNotFound, "FTP storage not found")
	}
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get FTP storage")
	}
	st.IsDefault = isDefault == 1
	st.IsActive = isActive == 1
	return st, nil
}

// Create adds a new FTP storage configuration.
func (s *FTPStorageService) Create(st *FTPStorage) (*FTPStorage, error) {
	if st.Port == 0 {
		st.Port = 21
	}
	if st.RemotePath == "" {
		st.RemotePath = "/"
	}

	isDefault := 0
	if st.IsDefault {
		isDefault = 1
		s.db.Exec("UPDATE ftp_storages SET is_default = 0") //nolint:errcheck
	}

	result, err := s.db.Exec(
		`INSERT INTO ftp_storages (name, host, port, username, password, remote_path, is_default, is_active)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
		st.Name, st.Host, st.Port, st.Username, st.Password, st.RemotePath, isDefault,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create FTP storage")
	}

	id, _ := result.LastInsertId()
	logger.Info().Int64("id", id).Str("name", st.Name).Msg("FTP storage created")
	return s.GetByID(id)
}

// Update modifies an existing FTP storage configuration.
func (s *FTPStorageService) Update(id int64, st *FTPStorage) (*FTPStorage, error) {
	existing, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	if st.Name != "" {
		existing.Name = st.Name
	}
	if st.Host != "" {
		existing.Host = st.Host
	}
	if st.Port > 0 {
		existing.Port = st.Port
	}
	if st.Username != "" {
		existing.Username = st.Username
	}
	if st.Password != "" && st.Password != "***" {
		existing.Password = st.Password
	}
	if st.RemotePath != "" {
		existing.RemotePath = st.RemotePath
	}

	isDefault := 0
	if st.IsDefault {
		isDefault = 1
		s.db.Exec("UPDATE ftp_storages SET is_default = 0 WHERE id != ?", id) //nolint:errcheck
	}
	isActive := 0
	if st.IsActive {
		isActive = 1
	}

	_, err = s.db.Exec(
		`UPDATE ftp_storages SET name=?, host=?, port=?, username=?, password=?,
		        remote_path=?, is_default=?, is_active=?, updated_at=CURRENT_TIMESTAMP
		 WHERE id=?`,
		existing.Name, existing.Host, existing.Port, existing.Username, existing.Password,
		existing.RemotePath, isDefault, isActive, id,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to update FTP storage")
	}

	logger.Info().Int64("id", id).Msg("FTP storage updated")
	return s.GetByID(id)
}

// Delete removes an FTP storage configuration.
func (s *FTPStorageService) Delete(id int64) error {
	_, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if _, err := s.db.Exec("DELETE FROM ftp_storages WHERE id = ?", id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to delete FTP storage")
	}

	logger.Info().Int64("id", id).Msg("FTP storage deleted")
	return nil
}

// TestConnection tests an FTP connection with the given parameters.
func (s *FTPStorageService) TestConnection(host string, port int, username, password, remotePath string) error {
	conn, err := s.connect(host, port, username, password)
	if err != nil {
		return err
	}
	defer conn.Quit()

	if remotePath != "" && remotePath != "/" {
		if err := conn.ChangeDir(remotePath); err != nil {
			return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("remote path '%s' not accessible: %v", remotePath, err))
		}
	}

	return nil
}

// TestConnectionByID tests connection using stored credentials.
func (s *FTPStorageService) TestConnectionByID(id int64) error {
	st, err := s.GetByID(id)
	if err != nil {
		return err
	}
	return s.TestConnection(st.Host, st.Port, st.Username, st.Password, st.RemotePath)
}

// UploadFile uploads a local file to the remote FTP storage.
func (s *FTPStorageService) UploadFile(storageID int64, localPath, remoteFileName string) error {
	st, err := s.GetByID(storageID)
	if err != nil {
		return err
	}

	conn, err := s.connect(st.Host, st.Port, st.Username, st.Password)
	if err != nil {
		return err
	}
	defer conn.Quit()

	remotePath := st.RemotePath
	if remotePath == "" {
		remotePath = "/"
	}

	s.ensureRemoteDir(conn, remotePath)

	file, err := os.Open(localPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to open local file for upload")
	}
	defer file.Close()

	fullRemotePath := path.Join(remotePath, remoteFileName)
	s.ensureRemoteDir(conn, path.Dir(fullRemotePath))
	if err := conn.Stor(fullRemotePath, file); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, fmt.Sprintf("failed to upload file to %s", fullRemotePath))
	}

	logger.Info().Str("local", localPath).Str("remote", fullRemotePath).Msg("file uploaded to FTP storage")
	return nil
}

// DownloadFile downloads a file from FTP storage to a local path.
func (s *FTPStorageService) DownloadFile(storageID int64, remoteFileName, localPath string) error {
	st, err := s.GetByID(storageID)
	if err != nil {
		return err
	}

	conn, err := s.connect(st.Host, st.Port, st.Username, st.Password)
	if err != nil {
		return err
	}
	defer conn.Quit()

	fullRemotePath := path.Join(st.RemotePath, remoteFileName)
	resp, err := conn.Retr(fullRemotePath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, fmt.Sprintf("failed to download %s", fullRemotePath))
	}
	defer resp.Close()

	outFile, err := os.Create(localPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create local file")
	}
	defer outFile.Close()

	if _, err := io.Copy(outFile, resp); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write downloaded file")
	}

	logger.Info().Str("remote", fullRemotePath).Str("local", localPath).Msg("file downloaded from FTP storage")
	return nil
}

// DeleteFile removes a file from the remote FTP storage.
func (s *FTPStorageService) DeleteFile(storageID int64, remoteFileName string) error {
	st, err := s.GetByID(storageID)
	if err != nil {
		return err
	}

	conn, err := s.connect(st.Host, st.Port, st.Username, st.Password)
	if err != nil {
		return err
	}
	defer conn.Quit()

	fullRemotePath := path.Join(st.RemotePath, remoteFileName)
	if err := conn.Delete(fullRemotePath); err != nil {
		logger.Warn().Err(err).Str("path", fullRemotePath).Msg("failed to delete remote file (may not exist)")
	}

	return nil
}

// FTPRemoteFile represents a file/directory on the remote FTP server.
type FTPRemoteFile struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	IsDir   bool   `json:"is_dir"`
	ModTime string `json:"mod_time"`
}

// ListFiles lists files in the remote FTP storage directory.
func (s *FTPStorageService) ListFiles(storageID int64, subDir string) ([]FTPRemoteFile, error) {
	st, err := s.GetByID(storageID)
	if err != nil {
		return nil, err
	}

	conn, err := s.connect(st.Host, st.Port, st.Username, st.Password)
	if err != nil {
		return nil, err
	}
	defer conn.Quit()

	remotePath := st.RemotePath
	if subDir != "" {
		remotePath = path.Join(remotePath, subDir)
	}

	entries, err := conn.List(remotePath)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list remote files")
	}

	var files []FTPRemoteFile
	for _, entry := range entries {
		if entry.Name == "." || entry.Name == ".." {
			continue
		}
		files = append(files, FTPRemoteFile{
			Name:    entry.Name,
			Size:    int64(entry.Size),
			IsDir:   entry.Type == ftp.EntryTypeFolder,
			ModTime: entry.Time.Format(time.RFC3339),
		})
	}
	return files, nil
}

// GetDefault returns the default FTP storage, or nil if none is set.
func (s *FTPStorageService) GetDefault() (*FTPStorage, error) {
	st := &FTPStorage{}
	var isDefault, isActive int
	err := s.db.QueryRow(
		`SELECT id, name, host, port, username, password, remote_path,
		        is_default, is_active, created_at, updated_at
		 FROM ftp_storages WHERE is_default = 1 AND is_active = 1 LIMIT 1`,
	).Scan(&st.ID, &st.Name, &st.Host, &st.Port, &st.Username, &st.Password,
		&st.RemotePath, &isDefault, &isActive, &st.CreatedAt, &st.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get default FTP storage")
	}
	st.IsDefault = isDefault == 1
	st.IsActive = isActive == 1
	return st, nil
}

// connect establishes an FTP connection with the given credentials.
func (s *FTPStorageService) connect(host string, port int, username, password string) (*ftp.ServerConn, error) {
	addr := fmt.Sprintf("%s:%d", host, port)
	conn, err := ftp.Dial(addr, ftp.DialWithTimeout(15*time.Second))
	if err != nil {
		return nil, apperrors.New(apperrors.ErrValidation, fmt.Sprintf("failed to connect to FTP server %s: %v", addr, err))
	}

	if err := conn.Login(username, password); err != nil {
		conn.Quit()
		return nil, apperrors.New(apperrors.ErrValidation, fmt.Sprintf("FTP login failed: %v", err))
	}

	return conn, nil
}

// ensureRemoteDir creates remote directory path recursively if it doesn't exist.
func (s *FTPStorageService) ensureRemoteDir(conn *ftp.ServerConn, dirPath string) {
	if dirPath == "/" || dirPath == "" {
		return
	}
	parts := strings.Split(strings.Trim(dirPath, "/"), "/")
	current := ""
	for _, p := range parts {
		current += "/" + p
		conn.MakeDir(current) //nolint:errcheck
	}
}
