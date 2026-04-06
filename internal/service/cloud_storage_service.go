package service

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"os"
	"path"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// CloudStorage represents a cloud storage configuration.
type CloudStorage struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Config    string `json:"config"`
	IsDefault bool   `json:"is_default"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// S3Config holds configuration for S3-compatible storage.
type S3Config struct {
	Endpoint   string `json:"endpoint"`
	Region     string `json:"region"`
	Bucket     string `json:"bucket"`
	AccessKey  string `json:"access_key"`
	SecretKey  string `json:"secret_key"`
	PathPrefix string `json:"path_prefix"`
	UseSSL     bool   `json:"use_ssl"`
}

// GoogleDriveConfig holds configuration for Google Drive storage.
type GoogleDriveConfig struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	RefreshToken string `json:"refresh_token"`
	AccessToken  string `json:"access_token"`
	TokenExpiry  string `json:"token_expiry"`
	FolderID     string `json:"folder_id"`
}

// OneDriveConfig holds configuration for OneDrive storage.
type OneDriveConfig struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	RefreshToken string `json:"refresh_token"`
	AccessToken  string `json:"access_token"`
	TokenExpiry  string `json:"token_expiry"`
	FolderPath   string `json:"folder_path"`
	DriveID      string `json:"drive_id"`
}

// CloudStorageService manages cloud storage configurations.
type CloudStorageService struct {
	db *sql.DB
}

// NewCloudStorageService creates a new CloudStorageService.
func NewCloudStorageService(db *sql.DB) *CloudStorageService {
	return &CloudStorageService{db: db}
}

// sensitiveKeys are config fields that should be masked in list responses.
var sensitiveKeys = []string{"secret_key", "client_secret", "access_token", "refresh_token"}

// maskConfig replaces sensitive values in a JSON config string with "***".
func maskConfig(configJSON string) string {
	var raw map[string]any
	if err := json.Unmarshal([]byte(configJSON), &raw); err != nil {
		return configJSON
	}
	for _, key := range sensitiveKeys {
		if _, ok := raw[key]; ok {
			raw[key] = "***"
		}
	}
	masked, err := json.Marshal(raw)
	if err != nil {
		return configJSON
	}
	return string(masked)
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

// List returns all cloud storage configurations with sensitive fields masked.
func (s *CloudStorageService) List() ([]*CloudStorage, error) {
	rows, err := s.db.Query(
		`SELECT id, name, type, config, is_default, is_active, created_at, updated_at
		 FROM cloud_storages ORDER BY name`)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list cloud storages")
	}
	defer rows.Close()

	var storages []*CloudStorage
	for rows.Next() {
		cs := &CloudStorage{}
		var isDefault, isActive int
		if err := rows.Scan(&cs.ID, &cs.Name, &cs.Type, &cs.Config,
			&isDefault, &isActive, &cs.CreatedAt, &cs.UpdatedAt); err != nil {
			continue
		}
		cs.IsDefault = isDefault == 1
		cs.IsActive = isActive == 1
		cs.Config = maskConfig(cs.Config)
		storages = append(storages, cs)
	}
	return storages, nil
}

// ListByType returns cloud storages filtered by type with sensitive fields masked.
func (s *CloudStorageService) ListByType(storageType string) ([]*CloudStorage, error) {
	rows, err := s.db.Query(
		`SELECT id, name, type, config, is_default, is_active, created_at, updated_at
		 FROM cloud_storages WHERE type = ? ORDER BY name`, storageType)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to list cloud storages by type")
	}
	defer rows.Close()

	var storages []*CloudStorage
	for rows.Next() {
		cs := &CloudStorage{}
		var isDefault, isActive int
		if err := rows.Scan(&cs.ID, &cs.Name, &cs.Type, &cs.Config,
			&isDefault, &isActive, &cs.CreatedAt, &cs.UpdatedAt); err != nil {
			continue
		}
		cs.IsDefault = isDefault == 1
		cs.IsActive = isActive == 1
		cs.Config = maskConfig(cs.Config)
		storages = append(storages, cs)
	}
	return storages, nil
}

// GetByID returns a single cloud storage by ID (unmasked config).
func (s *CloudStorageService) GetByID(id int64) (*CloudStorage, error) {
	cs := &CloudStorage{}
	var isDefault, isActive int
	err := s.db.QueryRow(
		`SELECT id, name, type, config, is_default, is_active, created_at, updated_at
		 FROM cloud_storages WHERE id = ?`, id,
	).Scan(&cs.ID, &cs.Name, &cs.Type, &cs.Config,
		&isDefault, &isActive, &cs.CreatedAt, &cs.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, apperrors.New(apperrors.ErrNotFound, "cloud storage not found")
	}
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get cloud storage")
	}
	cs.IsDefault = isDefault == 1
	cs.IsActive = isActive == 1
	return cs, nil
}

// Create adds a new cloud storage configuration.
func (s *CloudStorageService) Create(cs *CloudStorage) (*CloudStorage, error) {
	if cs.Config == "" {
		cs.Config = "{}"
	}

	isDefault := 0
	if cs.IsDefault {
		isDefault = 1
		s.db.Exec("UPDATE cloud_storages SET is_default = 0 WHERE type = ?", cs.Type) //nolint:errcheck
	}

	result, err := s.db.Exec(
		`INSERT INTO cloud_storages (name, type, config, is_default, is_active)
		 VALUES (?, ?, ?, ?, 1)`,
		cs.Name, cs.Type, cs.Config, isDefault,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create cloud storage")
	}

	id, _ := result.LastInsertId()
	logger.Info().Int64("id", id).Str("name", cs.Name).Str("type", cs.Type).Msg("cloud storage created")
	return s.GetByID(id)
}

// Update modifies an existing cloud storage configuration.
func (s *CloudStorageService) Update(id int64, cs *CloudStorage) (*CloudStorage, error) {
	existing, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	if cs.Name != "" {
		existing.Name = cs.Name
	}
	if cs.Config != "" && cs.Config != "{}" {
		// Merge: if updated config has "***" values, keep existing ones
		var newCfg, oldCfg map[string]any
		if err := json.Unmarshal([]byte(cs.Config), &newCfg); err == nil {
			if err := json.Unmarshal([]byte(existing.Config), &oldCfg); err == nil {
				for _, key := range sensitiveKeys {
					if val, ok := newCfg[key]; ok {
						if str, isStr := val.(string); isStr && str == "***" {
							if oldVal, exists := oldCfg[key]; exists {
								newCfg[key] = oldVal
							}
						}
					}
				}
				merged, _ := json.Marshal(newCfg)
				existing.Config = string(merged)
			} else {
				existing.Config = cs.Config
			}
		} else {
			existing.Config = cs.Config
		}
	}

	isDefault := 0
	if cs.IsDefault {
		isDefault = 1
		s.db.Exec("UPDATE cloud_storages SET is_default = 0 WHERE type = ? AND id != ?", existing.Type, id) //nolint:errcheck
	}
	isActive := 0
	if cs.IsActive {
		isActive = 1
	}

	_, err = s.db.Exec(
		`UPDATE cloud_storages SET name=?, config=?, is_default=?, is_active=?, updated_at=CURRENT_TIMESTAMP
		 WHERE id=?`,
		existing.Name, existing.Config, isDefault, isActive, id,
	)
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to update cloud storage")
	}

	logger.Info().Int64("id", id).Msg("cloud storage updated")
	return s.GetByID(id)
}

// Delete removes a cloud storage configuration.
func (s *CloudStorageService) Delete(id int64) error {
	_, err := s.GetByID(id)
	if err != nil {
		return err
	}

	if _, err := s.db.Exec("DELETE FROM cloud_storages WHERE id = ?", id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to delete cloud storage")
	}

	logger.Info().Int64("id", id).Msg("cloud storage deleted")
	return nil
}

// GetDefault returns the default cloud storage of a given type, or nil if none.
func (s *CloudStorageService) GetDefault(storageType string) (*CloudStorage, error) {
	cs := &CloudStorage{}
	var isDefault, isActive int
	err := s.db.QueryRow(
		`SELECT id, name, type, config, is_default, is_active, created_at, updated_at
		 FROM cloud_storages WHERE type = ? AND is_default = 1 AND is_active = 1 LIMIT 1`,
		storageType,
	).Scan(&cs.ID, &cs.Name, &cs.Type, &cs.Config,
		&isDefault, &isActive, &cs.CreatedAt, &cs.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get default cloud storage")
	}
	cs.IsDefault = isDefault == 1
	cs.IsActive = isActive == 1
	return cs, nil
}

// ---------------------------------------------------------------------------
// S3 operations
// ---------------------------------------------------------------------------

func (s *CloudStorageService) connectS3(cfg S3Config) (*minio.Client, error) {
	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
		Region: cfg.Region,
	})
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to create S3 client")
	}
	return client, nil
}

func (s *CloudStorageService) parseS3Config(cs *CloudStorage) (S3Config, error) {
	var cfg S3Config
	if err := json.Unmarshal([]byte(cs.Config), &cfg); err != nil {
		return cfg, apperrors.Wrap(err, apperrors.ErrValidation, "invalid S3 config")
	}
	return cfg, nil
}

// TestS3 tests an S3 connection with the given config.
func (s *CloudStorageService) TestS3(cfg S3Config) error {
	client, err := s.connectS3(cfg)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	exists, err := client.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("S3 connection failed: %v", err))
	}
	if !exists {
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("bucket %q does not exist", cfg.Bucket))
	}
	return nil
}

// UploadS3 uploads a local file to S3 storage.
func (s *CloudStorageService) UploadS3(storageID int64, localPath, remoteFileName string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseS3Config(cs)
	if err != nil {
		return err
	}

	client, err := s.connectS3(cfg)
	if err != nil {
		return err
	}

	file, err := os.Open(localPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to open local file for upload")
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to stat local file")
	}

	objectName := path.Join(cfg.PathPrefix, remoteFileName)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	_, err = client.PutObject(ctx, cfg.Bucket, objectName, file, stat.Size(), minio.PutObjectOptions{})
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to upload file to S3")
	}

	logger.Info().Str("local", localPath).Str("bucket", cfg.Bucket).Str("object", objectName).Msg("file uploaded to S3")
	return nil
}

// DownloadS3 downloads a file from S3 storage to a local path.
func (s *CloudStorageService) DownloadS3(storageID int64, remoteFileName, localPath string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseS3Config(cs)
	if err != nil {
		return err
	}

	client, err := s.connectS3(cfg)
	if err != nil {
		return err
	}

	objectName := path.Join(cfg.PathPrefix, remoteFileName)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	obj, err := client.GetObject(ctx, cfg.Bucket, objectName, minio.GetObjectOptions{})
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, fmt.Sprintf("failed to download %s from S3", objectName))
	}
	defer obj.Close()

	outFile, err := os.Create(localPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create local file")
	}
	defer outFile.Close()

	if _, err := io.Copy(outFile, obj); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write downloaded file")
	}

	logger.Info().Str("object", objectName).Str("local", localPath).Msg("file downloaded from S3")
	return nil
}

// DeleteS3 deletes a file from S3 storage.
func (s *CloudStorageService) DeleteS3(storageID int64, remoteFileName string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseS3Config(cs)
	if err != nil {
		return err
	}

	client, err := s.connectS3(cfg)
	if err != nil {
		return err
	}

	objectName := path.Join(cfg.PathPrefix, remoteFileName)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := client.RemoveObject(ctx, cfg.Bucket, objectName, minio.RemoveObjectOptions{}); err != nil {
		logger.Warn().Err(err).Str("object", objectName).Msg("failed to delete S3 object (may not exist)")
	}

	return nil
}

// ---------------------------------------------------------------------------
// Google Drive operations
// ---------------------------------------------------------------------------

func (s *CloudStorageService) parseGoogleDriveConfig(cs *CloudStorage) (GoogleDriveConfig, error) {
	var cfg GoogleDriveConfig
	if err := json.Unmarshal([]byte(cs.Config), &cfg); err != nil {
		return cfg, apperrors.Wrap(err, apperrors.ErrValidation, "invalid Google Drive config")
	}
	return cfg, nil
}

func (s *CloudStorageService) googleOAuthConfig(cfg GoogleDriveConfig, redirectURL string) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		Endpoint:     google.Endpoint,
		RedirectURL:  redirectURL,
		Scopes:       []string{"https://www.googleapis.com/auth/drive.file"},
	}
}

// GetGoogleAuthURL returns an OAuth authorization URL for Google Drive.
func (s *CloudStorageService) GetGoogleAuthURL(storageID int64, redirectURL string) (string, error) {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return "", err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return "", err
	}

	oauthCfg := s.googleOAuthConfig(cfg, redirectURL)
	state := fmt.Sprintf("%d", storageID)
	url := oauthCfg.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.ApprovalForce)
	return url, nil
}

// HandleGoogleCallback exchanges an OAuth code for tokens and saves them.
func (s *CloudStorageService) HandleGoogleCallback(storageID int64, code, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return err
	}

	oauthCfg := s.googleOAuthConfig(cfg, redirectURL)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	token, err := oauthCfg.Exchange(ctx, code)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrValidation, "failed to exchange OAuth code")
	}

	cfg.AccessToken = token.AccessToken
	cfg.RefreshToken = token.RefreshToken
	cfg.TokenExpiry = token.Expiry.Format(time.RFC3339)

	return s.updateConfig(storageID, cfg)
}

func (s *CloudStorageService) googleHTTPClient(cfg GoogleDriveConfig, redirectURL string) (*http.Client, error) {
	oauthCfg := s.googleOAuthConfig(cfg, redirectURL)
	expiry, _ := time.Parse(time.RFC3339, cfg.TokenExpiry)
	token := &oauth2.Token{
		AccessToken:  cfg.AccessToken,
		RefreshToken: cfg.RefreshToken,
		Expiry:       expiry,
		TokenType:    "Bearer",
	}
	return oauthCfg.Client(context.Background(), token), nil
}

// TestGoogleDrive tests a Google Drive connection.
func (s *CloudStorageService) TestGoogleDrive(storageID int64, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return err
	}

	if cfg.AccessToken == "" && cfg.RefreshToken == "" {
		return apperrors.New(apperrors.ErrValidation, "Google Drive not authorized — complete OAuth flow first")
	}

	client, err := s.googleHTTPClient(cfg, redirectURL)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", "https://www.googleapis.com/drive/v3/about?fields=user", nil)
	resp, err := client.Do(req)
	if err != nil {
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("Google Drive connection failed: %v", err))
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("Google Drive API error (%d): %s", resp.StatusCode, string(body)))
	}

	return nil
}

// UploadGoogleDrive uploads a file to Google Drive.
func (s *CloudStorageService) UploadGoogleDrive(storageID int64, localPath, remoteFileName, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return err
	}

	client, err := s.googleHTTPClient(cfg, redirectURL)
	if err != nil {
		return err
	}

	file, err := os.Open(localPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to open local file for upload")
	}
	defer file.Close()

	// If remoteFileName contains path separators, create folders first
	parentID := cfg.FolderID
	actualFileName := remoteFileName
	if dir := path.Dir(remoteFileName); dir != "." && dir != "" {
		folderID, err := s.ensureGoogleDriveFolder(client, cfg.FolderID, dir)
		if err != nil {
			return err
		}
		parentID = folderID
		actualFileName = path.Base(remoteFileName)
	}

	// Build multipart upload
	metadata := map[string]any{
		"name": actualFileName,
	}
	if parentID != "" {
		metadata["parents"] = []string{parentID}
	}
	metaJSON, _ := json.Marshal(metadata)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	metaHeader := make(textproto.MIMEHeader)
	metaHeader.Set("Content-Type", "application/json; charset=UTF-8")
	metaPart, err := writer.CreatePart(metaHeader)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create metadata part")
	}
	metaPart.Write(metaJSON)

	fileHeader := make(textproto.MIMEHeader)
	fileHeader.Set("Content-Type", "application/octet-stream")
	filePart, err := writer.CreatePart(fileHeader)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create file part")
	}
	if _, err := io.Copy(filePart, file); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to copy file data")
	}
	writer.Close()

	req, _ := http.NewRequest("POST",
		"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
		body)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := client.Do(req)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "Google Drive upload failed")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return apperrors.New(apperrors.ErrInternal, fmt.Sprintf("Google Drive upload error (%d): %s", resp.StatusCode, string(respBody)))
	}

	logger.Info().Str("local", localPath).Str("remote", remoteFileName).Msg("file uploaded to Google Drive")
	return nil
}

// findGoogleDriveFile finds a file by name in the configured folder.
func (s *CloudStorageService) findGoogleDriveFile(client *http.Client, fileName, folderID string) (string, error) {
	query := fmt.Sprintf("name='%s' and trashed=false", fileName)
	if folderID != "" {
		query += fmt.Sprintf(" and '%s' in parents", folderID)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET",
		fmt.Sprintf("https://www.googleapis.com/drive/v3/files?q=%s&fields=files(id,name)", query), nil)
	resp, err := client.Do(req)
	if err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to search Google Drive files")
	}
	defer resp.Body.Close()

	var result struct {
		Files []struct {
			ID string `json:"id"`
		} `json:"files"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to parse Google Drive response")
	}
	if len(result.Files) == 0 {
		return "", apperrors.New(apperrors.ErrNotFound, fmt.Sprintf("file %q not found on Google Drive", fileName))
	}
	return result.Files[0].ID, nil
}

// ensureGoogleDriveFolder finds or creates a nested folder path under parentID.
// Returns the final folder's ID.
func (s *CloudStorageService) ensureGoogleDriveFolder(client *http.Client, parentID string, folderPath string) (string, error) {
	parts := strings.Split(strings.Trim(folderPath, "/"), "/")
	currentParent := parentID
	for _, name := range parts {
		if name == "" {
			continue
		}
		// Search for existing folder
		query := fmt.Sprintf("name='%s' and mimeType='application/vnd.google-apps.folder' and trashed=false", name)
		if currentParent != "" {
			query += fmt.Sprintf(" and '%s' in parents", currentParent)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		req, _ := http.NewRequestWithContext(ctx, "GET",
			fmt.Sprintf("https://www.googleapis.com/drive/v3/files?q=%s&fields=files(id)", query), nil)
		resp, err := client.Do(req)
		cancel()
		if err != nil {
			return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to search Google Drive folders")
		}
		var result struct {
			Files []struct{ ID string `json:"id"` } `json:"files"`
		}
		json.NewDecoder(resp.Body).Decode(&result)
		resp.Body.Close()

		if len(result.Files) > 0 {
			currentParent = result.Files[0].ID
			continue
		}

		// Create folder
		meta := map[string]any{
			"name":     name,
			"mimeType": "application/vnd.google-apps.folder",
		}
		if currentParent != "" {
			meta["parents"] = []string{currentParent}
		}
		metaJSON, _ := json.Marshal(meta)
		ctx2, cancel2 := context.WithTimeout(context.Background(), 15*time.Second)
		req2, _ := http.NewRequestWithContext(ctx2, "POST",
			"https://www.googleapis.com/drive/v3/files", bytes.NewReader(metaJSON))
		req2.Header.Set("Content-Type", "application/json")
		resp2, err := client.Do(req2)
		cancel2()
		if err != nil {
			return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to create Google Drive folder")
		}
		var created struct{ ID string `json:"id"` }
		json.NewDecoder(resp2.Body).Decode(&created)
		resp2.Body.Close()
		if created.ID == "" {
			return "", apperrors.New(apperrors.ErrInternal, fmt.Sprintf("failed to create folder %q on Google Drive", name))
		}
		currentParent = created.ID
	}
	return currentParent, nil
}

// resolveGoogleDrivePath resolves a path-based file name (e.g. "itdlupanel_backup/site/file.tar.gz")
// into the target folder ID and base file name.
func (s *CloudStorageService) resolveGoogleDrivePath(client *http.Client, remoteFileName, rootFolderID string) (folderID, baseName string, err error) {
	folderID = rootFolderID
	baseName = remoteFileName
	if dir := path.Dir(remoteFileName); dir != "." && dir != "" {
		folderID, err = s.ensureGoogleDriveFolder(client, rootFolderID, dir)
		if err != nil {
			return "", "", err
		}
		baseName = path.Base(remoteFileName)
	}
	return folderID, baseName, nil
}

// DownloadGoogleDrive downloads a file from Google Drive.
func (s *CloudStorageService) DownloadGoogleDrive(storageID int64, remoteFileName, localPath, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return err
	}

	client, err := s.googleHTTPClient(cfg, redirectURL)
	if err != nil {
		return err
	}

	searchFolder, searchName, err := s.resolveGoogleDrivePath(client, remoteFileName, cfg.FolderID)
	if err != nil {
		return err
	}

	fileID, err := s.findGoogleDriveFile(client, searchName, searchFolder)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET",
		fmt.Sprintf("https://www.googleapis.com/drive/v3/files/%s?alt=media", fileID), nil)
	resp, err := client.Do(req)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "Google Drive download failed")
	}
	defer resp.Body.Close()

	outFile, err := os.Create(localPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create local file")
	}
	defer outFile.Close()

	if _, err := io.Copy(outFile, resp.Body); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write downloaded file")
	}

	logger.Info().Str("remote", remoteFileName).Str("local", localPath).Msg("file downloaded from Google Drive")
	return nil
}

// DeleteGoogleDrive deletes a file from Google Drive.
func (s *CloudStorageService) DeleteGoogleDrive(storageID int64, remoteFileName, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseGoogleDriveConfig(cs)
	if err != nil {
		return err
	}

	client, err := s.googleHTTPClient(cfg, redirectURL)
	if err != nil {
		return err
	}

	searchFolder, searchName, err := s.resolveGoogleDrivePath(client, remoteFileName, cfg.FolderID)
	if err != nil {
		logger.Warn().Err(err).Str("file", remoteFileName).Msg("failed to resolve path on Google Drive for deletion")
		return nil
	}

	fileID, err := s.findGoogleDriveFile(client, searchName, searchFolder)
	if err != nil {
		logger.Warn().Err(err).Str("file", remoteFileName).Msg("file not found on Google Drive for deletion")
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "DELETE",
		fmt.Sprintf("https://www.googleapis.com/drive/v3/files/%s", fileID), nil)
	resp, err := client.Do(req)
	if err != nil {
		logger.Warn().Err(err).Str("file", remoteFileName).Msg("failed to delete Google Drive file")
		return nil
	}
	defer resp.Body.Close()

	return nil
}

// ---------------------------------------------------------------------------
// OneDrive operations
// ---------------------------------------------------------------------------

const (
	msAuthURL  = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
	msTokenURL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
)

func (s *CloudStorageService) parseOneDriveConfig(cs *CloudStorage) (OneDriveConfig, error) {
	var cfg OneDriveConfig
	if err := json.Unmarshal([]byte(cs.Config), &cfg); err != nil {
		return cfg, apperrors.Wrap(err, apperrors.ErrValidation, "invalid OneDrive config")
	}
	return cfg, nil
}

func (s *CloudStorageService) oneDriveOAuthConfig(cfg OneDriveConfig, redirectURL string) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		Endpoint: oauth2.Endpoint{
			AuthURL:  msAuthURL,
			TokenURL: msTokenURL,
		},
		RedirectURL: redirectURL,
		Scopes:      []string{"Files.ReadWrite.All", "offline_access"},
	}
}

// GetOneDriveAuthURL returns an OAuth authorization URL for OneDrive.
func (s *CloudStorageService) GetOneDriveAuthURL(storageID int64, redirectURL string) (string, error) {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return "", err
	}
	cfg, err := s.parseOneDriveConfig(cs)
	if err != nil {
		return "", err
	}

	oauthCfg := s.oneDriveOAuthConfig(cfg, redirectURL)
	state := fmt.Sprintf("%d", storageID)
	url := oauthCfg.AuthCodeURL(state, oauth2.AccessTypeOffline)
	return url, nil
}

// HandleOneDriveCallback exchanges an OAuth code for tokens and saves them.
func (s *CloudStorageService) HandleOneDriveCallback(storageID int64, code, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseOneDriveConfig(cs)
	if err != nil {
		return err
	}

	oauthCfg := s.oneDriveOAuthConfig(cfg, redirectURL)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	token, err := oauthCfg.Exchange(ctx, code)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrValidation, "failed to exchange OAuth code")
	}

	cfg.AccessToken = token.AccessToken
	cfg.RefreshToken = token.RefreshToken
	cfg.TokenExpiry = token.Expiry.Format(time.RFC3339)

	return s.updateConfig(storageID, cfg)
}

func (s *CloudStorageService) oneDriveHTTPClient(cfg OneDriveConfig, redirectURL string) (*http.Client, error) {
	oauthCfg := s.oneDriveOAuthConfig(cfg, redirectURL)
	expiry, _ := time.Parse(time.RFC3339, cfg.TokenExpiry)
	token := &oauth2.Token{
		AccessToken:  cfg.AccessToken,
		RefreshToken: cfg.RefreshToken,
		Expiry:       expiry,
		TokenType:    "Bearer",
	}
	return oauthCfg.Client(context.Background(), token), nil
}

// oneDrivePath constructs the Graph API path for a file.
func oneDrivePath(cfg OneDriveConfig, fileName string) string {
	folder := cfg.FolderPath
	if folder == "" {
		folder = "/"
	}
	folder = strings.TrimSuffix(folder, "/")
	if folder == "" || folder == "/" {
		return fmt.Sprintf("/root:/%s:", fileName)
	}
	return fmt.Sprintf("/root:/%s/%s:", strings.TrimPrefix(folder, "/"), fileName)
}

// oneDriveBaseURL returns the base Graph API URL for the drive.
func oneDriveBaseURL(cfg OneDriveConfig) string {
	if cfg.DriveID != "" {
		return fmt.Sprintf("https://graph.microsoft.com/v1.0/drives/%s", cfg.DriveID)
	}
	return "https://graph.microsoft.com/v1.0/me/drive"
}

// TestOneDrive tests a OneDrive connection.
func (s *CloudStorageService) TestOneDrive(storageID int64, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseOneDriveConfig(cs)
	if err != nil {
		return err
	}

	if cfg.AccessToken == "" && cfg.RefreshToken == "" {
		return apperrors.New(apperrors.ErrValidation, "OneDrive not authorized — complete OAuth flow first")
	}

	client, err := s.oneDriveHTTPClient(cfg, redirectURL)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", oneDriveBaseURL(cfg), nil)
	resp, err := client.Do(req)
	if err != nil {
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("OneDrive connection failed: %v", err))
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return apperrors.New(apperrors.ErrValidation, fmt.Sprintf("OneDrive API error (%d): %s", resp.StatusCode, string(body)))
	}

	return nil
}

// UploadOneDrive uploads a file to OneDrive.
func (s *CloudStorageService) UploadOneDrive(storageID int64, localPath, remoteFileName, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseOneDriveConfig(cs)
	if err != nil {
		return err
	}

	client, err := s.oneDriveHTTPClient(cfg, redirectURL)
	if err != nil {
		return err
	}

	file, err := os.Open(localPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to open local file for upload")
	}
	defer file.Close()

	uploadURL := fmt.Sprintf("%s%s/content", oneDriveBaseURL(cfg), oneDrivePath(cfg, remoteFileName))

	req, _ := http.NewRequest("PUT", uploadURL, file)
	req.Header.Set("Content-Type", "application/octet-stream")

	resp, err := client.Do(req)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "OneDrive upload failed")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return apperrors.New(apperrors.ErrInternal, fmt.Sprintf("OneDrive upload error (%d): %s", resp.StatusCode, string(respBody)))
	}

	logger.Info().Str("local", localPath).Str("remote", remoteFileName).Msg("file uploaded to OneDrive")
	return nil
}

// DownloadOneDrive downloads a file from OneDrive.
func (s *CloudStorageService) DownloadOneDrive(storageID int64, remoteFileName, localPath, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseOneDriveConfig(cs)
	if err != nil {
		return err
	}

	client, err := s.oneDriveHTTPClient(cfg, redirectURL)
	if err != nil {
		return err
	}

	downloadURL := fmt.Sprintf("%s%s/content", oneDriveBaseURL(cfg), oneDrivePath(cfg, remoteFileName))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", downloadURL, nil)
	resp, err := client.Do(req)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "OneDrive download failed")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return apperrors.New(apperrors.ErrInternal, fmt.Sprintf("OneDrive download error (%d): %s", resp.StatusCode, string(respBody)))
	}

	outFile, err := os.Create(localPath)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to create local file")
	}
	defer outFile.Close()

	if _, err := io.Copy(outFile, resp.Body); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write downloaded file")
	}

	logger.Info().Str("remote", remoteFileName).Str("local", localPath).Msg("file downloaded from OneDrive")
	return nil
}

// DeleteOneDrive deletes a file from OneDrive.
func (s *CloudStorageService) DeleteOneDrive(storageID int64, remoteFileName, redirectURL string) error {
	cs, err := s.GetByID(storageID)
	if err != nil {
		return err
	}
	cfg, err := s.parseOneDriveConfig(cs)
	if err != nil {
		return err
	}

	client, err := s.oneDriveHTTPClient(cfg, redirectURL)
	if err != nil {
		return err
	}

	deleteURL := fmt.Sprintf("%s%s", oneDriveBaseURL(cfg), oneDrivePath(cfg, remoteFileName))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "DELETE", deleteURL, nil)
	resp, err := client.Do(req)
	if err != nil {
		logger.Warn().Err(err).Str("file", remoteFileName).Msg("failed to delete OneDrive file")
		return nil
	}
	defer resp.Body.Close()

	return nil
}

// ---------------------------------------------------------------------------
// Generic dispatch methods
// ---------------------------------------------------------------------------

// TestConnection tests a cloud storage connection by ID.
func (s *CloudStorageService) TestConnection(id int64, redirectURL string) error {
	cs, err := s.GetByID(id)
	if err != nil {
		return err
	}

	switch cs.Type {
	case "s3":
		cfg, err := s.parseS3Config(cs)
		if err != nil {
			return err
		}
		return s.TestS3(cfg)
	case "google_drive":
		return s.TestGoogleDrive(id, redirectURL)
	case "onedrive":
		return s.TestOneDrive(id, redirectURL)
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported storage type: "+cs.Type)
	}
}

// UploadFile uploads a file to the specified cloud storage.
func (s *CloudStorageService) UploadFile(id int64, localPath, remoteFileName, redirectURL string) error {
	cs, err := s.GetByID(id)
	if err != nil {
		return err
	}

	switch cs.Type {
	case "s3":
		return s.UploadS3(id, localPath, remoteFileName)
	case "google_drive":
		return s.UploadGoogleDrive(id, localPath, remoteFileName, redirectURL)
	case "onedrive":
		return s.UploadOneDrive(id, localPath, remoteFileName, redirectURL)
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported storage type: "+cs.Type)
	}
}

// DownloadFile downloads a file from the specified cloud storage.
func (s *CloudStorageService) DownloadFile(id int64, remoteFileName, localPath, redirectURL string) error {
	cs, err := s.GetByID(id)
	if err != nil {
		return err
	}

	switch cs.Type {
	case "s3":
		return s.DownloadS3(id, remoteFileName, localPath)
	case "google_drive":
		return s.DownloadGoogleDrive(id, remoteFileName, localPath, redirectURL)
	case "onedrive":
		return s.DownloadOneDrive(id, remoteFileName, localPath, redirectURL)
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported storage type: "+cs.Type)
	}
}

// DeleteFile deletes a file from the specified cloud storage.
func (s *CloudStorageService) DeleteFile(id int64, remoteFileName, redirectURL string) error {
	cs, err := s.GetByID(id)
	if err != nil {
		return err
	}

	switch cs.Type {
	case "s3":
		return s.DeleteS3(id, remoteFileName)
	case "google_drive":
		return s.DeleteGoogleDrive(id, remoteFileName, redirectURL)
	case "onedrive":
		return s.DeleteOneDrive(id, remoteFileName, redirectURL)
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported storage type: "+cs.Type)
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// updateConfig marshals a config struct and saves it to the database.
func (s *CloudStorageService) updateConfig(id int64, cfg any) error {
	configJSON, err := json.Marshal(cfg)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to marshal config")
	}

	_, err = s.db.Exec(
		"UPDATE cloud_storages SET config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		string(configJSON), id,
	)
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to update cloud storage config")
	}

	return nil
}

// TestInlineS3 tests an S3 connection from inline config (not saved to DB).
func (s *CloudStorageService) TestInlineS3(cfg S3Config) error {
	return s.TestS3(cfg)
}

// TestInline tests a cloud storage connection from inline config.
func (s *CloudStorageService) TestInline(storageType string, configJSON string) error {
	switch storageType {
	case "s3":
		var cfg S3Config
		if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
			return apperrors.Wrap(err, apperrors.ErrValidation, "invalid S3 config")
		}
		return s.TestS3(cfg)
	case "google_drive":
		return apperrors.New(apperrors.ErrValidation, "Google Drive requires OAuth — use auth-url endpoint first")
	case "onedrive":
		return apperrors.New(apperrors.ErrValidation, "OneDrive requires OAuth — use auth-url endpoint first")
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported storage type: "+storageType)
	}
}

// GetAuthURL returns an OAuth URL for the given storage (Google Drive or OneDrive).
func (s *CloudStorageService) GetAuthURL(id int64, redirectURL string) (string, string, error) {
	cs, err := s.GetByID(id)
	if err != nil {
		return "", "", err
	}

	switch cs.Type {
	case "google_drive":
		url, err := s.GetGoogleAuthURL(id, redirectURL)
		return url, "google_drive", err
	case "onedrive":
		url, err := s.GetOneDriveAuthURL(id, redirectURL)
		return url, "onedrive", err
	default:
		return "", "", apperrors.New(apperrors.ErrValidation, "storage type does not support OAuth: "+cs.Type)
	}
}

// HandleOAuthCallback handles the OAuth callback based on provider.
func (s *CloudStorageService) HandleOAuthCallback(provider string, storageID int64, code, redirectURL string) error {
	switch provider {
	case "google_drive":
		return s.HandleGoogleCallback(storageID, code, redirectURL)
	case "onedrive":
		return s.HandleOneDriveCallback(storageID, code, redirectURL)
	default:
		return apperrors.New(apperrors.ErrValidation, "unsupported OAuth provider: "+provider)
	}
}
