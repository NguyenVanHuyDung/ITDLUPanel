package models

import (
	"database/sql"
	"fmt"
	"time"
)

// User represents a panel user account.
type User struct {
	ID          int64      `json:"id"`
	Username    string     `json:"username"`
	Password    string     `json:"-"`
	Email       string     `json:"email,omitempty"`
	Role        string     `json:"role"`
	TOTPSecret  string     `json:"-"`
	TOTPEnabled bool       `json:"totp_enabled"`
	Status      int        `json:"status"`
	LastLogin   *time.Time `json:"last_login,omitempty"`
	LastIP      string     `json:"last_ip,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// UserRepository provides CRUD operations for users.
type UserRepository struct {
	db *sql.DB
}

// NewUserRepository creates a new UserRepository.
func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

// Create inserts a new user and sets the ID on the struct.
func (r *UserRepository) Create(user *User) error {
	result, err := r.db.Exec(
		`INSERT INTO users (username, password, email, role, totp_secret, totp_enabled, status)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		user.Username, user.Password, user.Email, user.Role,
		user.TOTPSecret, boolToInt(user.TOTPEnabled), user.Status,
	)
	if err != nil {
		return fmt.Errorf("failed to create user: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to get last insert id: %w", err)
	}
	user.ID = id

	return r.reload(user)
}

// GetByID retrieves a user by ID.
func (r *UserRepository) GetByID(id int64) (*User, error) {
	user := &User{}
	err := r.scanUser(
		r.db.QueryRow("SELECT * FROM users WHERE id = ?", id),
		user,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user by id: %w", err)
	}
	return user, nil
}

// GetByUsername retrieves a user by username.
func (r *UserRepository) GetByUsername(username string) (*User, error) {
	user := &User{}
	err := r.scanUser(
		r.db.QueryRow("SELECT * FROM users WHERE username = ?", username),
		user,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user by username: %w", err)
	}
	return user, nil
}

// Update updates an existing user.
func (r *UserRepository) Update(user *User) error {
	_, err := r.db.Exec(
		`UPDATE users SET username = ?, password = ?, email = ?, role = ?,
		 totp_secret = ?, totp_enabled = ?, status = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE id = ?`,
		user.Username, user.Password, user.Email, user.Role,
		user.TOTPSecret, boolToInt(user.TOTPEnabled), user.Status, user.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update user: %w", err)
	}
	return nil
}

// Delete removes a user by ID.
func (r *UserRepository) Delete(id int64) error {
	result, err := r.db.Exec("DELETE FROM users WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

// List returns a paginated list of users and the total count.
func (r *UserRepository) List(page, perPage int) ([]User, int64, error) {
	if page < 1 {
		page = 1
	}
	if perPage < 1 {
		perPage = 20
	}

	var total int64
	if err := r.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count users: %w", err)
	}

	offset := (page - 1) * perPage
	rows, err := r.db.Query(
		"SELECT * FROM users ORDER BY id ASC LIMIT ? OFFSET ?",
		perPage, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list users: %w", err)
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := r.scanRows(rows, &u); err != nil {
			return nil, 0, fmt.Errorf("failed to scan user: %w", err)
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating users: %w", err)
	}

	return users, total, nil
}

// UpdateLastLogin updates the last login timestamp and IP for a user.
func (r *UserRepository) UpdateLastLogin(id int64, ip string) error {
	_, err := r.db.Exec(
		"UPDATE users SET last_login = CURRENT_TIMESTAMP, last_ip = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		ip, id,
	)
	if err != nil {
		return fmt.Errorf("failed to update last login: %w", err)
	}
	return nil
}

func (r *UserRepository) reload(user *User) error {
	return r.scanUser(
		r.db.QueryRow("SELECT * FROM users WHERE id = ?", user.ID),
		user,
	)
}

func (r *UserRepository) scanUser(row *sql.Row, user *User) error {
	var (
		email       sql.NullString
		totpSecret  sql.NullString
		totpEnabled int
		lastLogin   sql.NullTime
		lastIP      sql.NullString
	)

	err := row.Scan(
		&user.ID, &user.Username, &user.Password, &email,
		&user.Role, &totpSecret, &totpEnabled, &user.Status,
		&lastLogin, &lastIP, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return err
	}

	user.Email = email.String
	user.TOTPSecret = totpSecret.String
	user.TOTPEnabled = totpEnabled == 1
	if lastLogin.Valid {
		user.LastLogin = &lastLogin.Time
	}
	user.LastIP = lastIP.String

	return nil
}

func (r *UserRepository) scanRows(rows *sql.Rows, user *User) error {
	var (
		email       sql.NullString
		totpSecret  sql.NullString
		totpEnabled int
		lastLogin   sql.NullTime
		lastIP      sql.NullString
	)

	err := rows.Scan(
		&user.ID, &user.Username, &user.Password, &email,
		&user.Role, &totpSecret, &totpEnabled, &user.Status,
		&lastLogin, &lastIP, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return err
	}

	user.Email = email.String
	user.TOTPSecret = totpSecret.String
	user.TOTPEnabled = totpEnabled == 1
	if lastLogin.Valid {
		user.LastLogin = &lastLogin.Time
	}
	user.LastIP = lastIP.String

	return nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
