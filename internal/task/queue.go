package task

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/websocket"
)

// TaskStatus represents the lifecycle state of a task.
type TaskStatus string

const (
	StatusPending   TaskStatus = "pending"
	StatusRunning   TaskStatus = "running"
	StatusCompleted TaskStatus = "completed"
	StatusFailed    TaskStatus = "failed"
	StatusCancelled TaskStatus = "cancelled"
)

// TaskFunc is the handler signature for processing a task.
// progressFn should be called to report progress (0-100) with an optional message.
type TaskFunc func(ctx context.Context, task *TaskInfo, progressFn func(int, string)) error

// TaskInfo holds metadata about a task.
type TaskInfo struct {
	ID          int64      `json:"id"`
	Type        string     `json:"type"`
	Name        string     `json:"name"`
	Status      TaskStatus `json:"status"`
	Progress    int        `json:"progress"`
	Log         string     `json:"log,omitempty"`
	Result      string     `json:"result,omitempty"`
	Error       string     `json:"error,omitempty"`
	CreatedBy   int64      `json:"created_by,omitempty"`
	StartedAt   *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	Duration    string     `json:"duration,omitempty"`
}

// TaskSummary holds counts of tasks by status.
type TaskSummary struct {
	Running   int64 `json:"running"`
	Pending   int64 `json:"pending"`
	Completed int64 `json:"completed"`
	Failed    int64 `json:"failed"`
	Total     int64 `json:"total"`
}

// Queue manages background task execution.
type Queue struct {
	db     *sql.DB
	hub    *websocket.Hub
	tasks  chan int64
	cancel map[int64]context.CancelFunc
	mu     sync.Mutex
	funcs  map[string]TaskFunc
	wg     sync.WaitGroup
	stop   chan struct{}
}

// NewQueue creates a new task queue.
func NewQueue(db *sql.DB, hub *websocket.Hub, maxConcurrent int) *Queue {
	if maxConcurrent <= 0 {
		maxConcurrent = 4
	}
	return &Queue{
		db:     db,
		hub:    hub,
		tasks:  make(chan int64, 1000),
		cancel: make(map[int64]context.CancelFunc),
		funcs:  make(map[string]TaskFunc),
		stop:   make(chan struct{}),
	}
}

// Start launches worker goroutines that consume tasks from the queue.
func (q *Queue) Start() {
	maxConcurrent := cap(q.tasks)
	if maxConcurrent > 10 {
		maxConcurrent = 4
	}
	for i := 0; i < maxConcurrent; i++ {
		q.wg.Add(1)
		go q.worker()
	}
	logger.Info().Int("workers", maxConcurrent).Msg("task queue started")
}

// Stop signals all workers to finish and waits for them.
func (q *Queue) Stop() {
	close(q.stop)
	q.wg.Wait()
	logger.Info().Msg("task queue stopped")
}

// RegisterHandler registers a handler function for a given task type.
func (q *Queue) RegisterHandler(taskType string, fn TaskFunc) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.funcs[taskType] = fn
}

// Enqueue creates a new task record in the database and pushes it to the work channel.
func (q *Queue) Enqueue(taskType, name string, createdBy int64) (int64, error) {
	result, err := q.db.Exec(
		"INSERT INTO tasks (type, name, status, progress, created_by, created_at) VALUES (?, ?, ?, 0, ?, ?)",
		taskType, name, string(StatusPending), createdBy, time.Now(),
	)
	if err != nil {
		return 0, fmt.Errorf("failed to insert task: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("failed to get task id: %w", err)
	}

	// Non-blocking push; if queue is full the task stays pending in DB.
	select {
	case q.tasks <- id:
	default:
		logger.Warn().Int64("task_id", id).Msg("task queue full, task will remain pending")
	}

	q.broadcastTaskUpdate(id)
	return id, nil
}

// Cancel cancels a running task.
func (q *Queue) Cancel(taskID int64) error {
	q.mu.Lock()
	cancelFn, ok := q.cancel[taskID]
	q.mu.Unlock()

	if ok {
		cancelFn()
	}

	_, err := q.db.Exec(
		"UPDATE tasks SET status = ?, completed_at = ? WHERE id = ? AND status IN (?, ?)",
		string(StatusCancelled), time.Now(), taskID, string(StatusPending), string(StatusRunning),
	)
	if err != nil {
		return fmt.Errorf("failed to cancel task: %w", err)
	}

	q.broadcastTaskUpdate(taskID)
	return nil
}

// GetTask returns a task by ID.
func (q *Queue) GetTask(taskID int64) (*TaskInfo, error) {
	return q.scanTask(q.db.QueryRow(
		"SELECT id, type, name, status, progress, COALESCE(log,''), COALESCE(result,''), COALESCE(error,''), COALESCE(created_by,0), started_at, completed_at, created_at FROM tasks WHERE id = ?",
		taskID,
	))
}

// ListTasks returns a paginated list of tasks, optionally filtered by status.
func (q *Queue) ListTasks(page, perPage int, status string) ([]TaskInfo, int64, error) {
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}
	offset := (page - 1) * perPage

	// Count query
	countQuery := "SELECT COUNT(*) FROM tasks"
	args := []interface{}{}
	if status != "" {
		countQuery += " WHERE status = ?"
		args = append(args, status)
	}

	var total int64
	if err := q.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count tasks: %w", err)
	}

	// Data query
	dataQuery := "SELECT id, type, name, status, progress, COALESCE(log,''), COALESCE(result,''), COALESCE(error,''), COALESCE(created_by,0), started_at, completed_at, created_at FROM tasks"
	dataArgs := []interface{}{}
	if status != "" {
		dataQuery += " WHERE status = ?"
		dataArgs = append(dataArgs, status)
	}
	dataQuery += " ORDER BY id DESC LIMIT ? OFFSET ?"
	dataArgs = append(dataArgs, perPage, offset)

	rows, err := q.db.Query(dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list tasks: %w", err)
	}
	defer rows.Close()

	var tasks []TaskInfo
	for rows.Next() {
		t, err := q.scanTaskRow(rows)
		if err != nil {
			return nil, 0, err
		}
		tasks = append(tasks, *t)
	}

	return tasks, total, rows.Err()
}

// GetTaskSummary returns counts of tasks grouped by status.
func (q *Queue) GetTaskSummary() (*TaskSummary, error) {
	summary := &TaskSummary{}
	rows, err := q.db.Query("SELECT status, COUNT(*) FROM tasks GROUP BY status")
	if err != nil {
		return nil, fmt.Errorf("failed to get task summary: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var status string
		var count int64
		if err := rows.Scan(&status, &count); err != nil {
			return nil, fmt.Errorf("failed to scan task summary: %w", err)
		}
		summary.Total += count
		switch TaskStatus(status) {
		case StatusRunning:
			summary.Running = count
		case StatusPending:
			summary.Pending = count
		case StatusCompleted:
			summary.Completed = count
		case StatusFailed:
			summary.Failed = count
		}
	}
	return summary, rows.Err()
}

// GetTaskLog returns the log content for a task.
func (q *Queue) GetTaskLog(taskID int64) (string, error) {
	var log sql.NullString
	err := q.db.QueryRow("SELECT log FROM tasks WHERE id = ?", taskID).Scan(&log)
	if err != nil {
		return "", fmt.Errorf("failed to get task log: %w", err)
	}
	return log.String, nil
}

func (q *Queue) worker() {
	defer q.wg.Done()
	for {
		select {
		case <-q.stop:
			return
		case taskID, ok := <-q.tasks:
			if !ok {
				return
			}
			q.processTask(taskID)
		}
	}
}

func (q *Queue) processTask(taskID int64) {
	task, err := q.GetTask(taskID)
	if err != nil {
		logger.Error().Err(err).Int64("task_id", taskID).Msg("failed to load task")
		return
	}

	// Look up the handler
	q.mu.Lock()
	handler, ok := q.funcs[task.Type]
	q.mu.Unlock()
	if !ok {
		q.failTask(taskID, fmt.Sprintf("no handler registered for task type: %s", task.Type))
		return
	}

	// Mark as running
	now := time.Now()
	_, _ = q.db.Exec(
		"UPDATE tasks SET status = ?, started_at = ? WHERE id = ?",
		string(StatusRunning), now, taskID,
	)
	task.Status = StatusRunning
	q.broadcastTaskUpdate(taskID)

	// Create cancellable context
	ctx, cancelFn := context.WithCancel(context.Background())
	q.mu.Lock()
	q.cancel[taskID] = cancelFn
	q.mu.Unlock()

	defer func() {
		cancelFn()
		q.mu.Lock()
		delete(q.cancel, taskID)
		q.mu.Unlock()
	}()

	// progressFn updates the progress in DB and broadcasts
	progressFn := func(pct int, msg string) {
		if pct < 0 {
			pct = 0
		}
		if pct > 100 {
			pct = 100
		}
		_, _ = q.db.Exec("UPDATE tasks SET progress = ?, log = COALESCE(log,'') || ? WHERE id = ?",
			pct, msg+"\n", taskID)
		q.broadcastTaskUpdate(taskID)
	}

	// Execute handler
	if err := handler(ctx, task, progressFn); err != nil {
		q.failTask(taskID, err.Error())
		return
	}

	// Mark completed
	_, _ = q.db.Exec(
		"UPDATE tasks SET status = ?, progress = 100, completed_at = ? WHERE id = ?",
		string(StatusCompleted), time.Now(), taskID,
	)
	q.broadcastTaskUpdate(taskID)
}

func (q *Queue) failTask(taskID int64, errMsg string) {
	_, _ = q.db.Exec(
		"UPDATE tasks SET status = ?, error = ?, completed_at = ? WHERE id = ?",
		string(StatusFailed), errMsg, time.Now(), taskID,
	)
	q.broadcastTaskUpdate(taskID)
}

func (q *Queue) broadcastTaskUpdate(taskID int64) {
	if q.hub == nil {
		return
	}
	task, err := q.GetTask(taskID)
	if err != nil {
		return
	}
	q.hub.BroadcastJSON(websocket.NewEvent(websocket.EventTaskUpdate, task))
}

// scanTask scans a single task row from *sql.Row.
func (q *Queue) scanTask(row *sql.Row) (*TaskInfo, error) {
	t := &TaskInfo{}
	var startedAt, completedAt sql.NullTime
	err := row.Scan(
		&t.ID, &t.Type, &t.Name, &t.Status, &t.Progress,
		&t.Log, &t.Result, &t.Error, &t.CreatedBy,
		&startedAt, &completedAt, &t.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to scan task: %w", err)
	}
	if startedAt.Valid {
		t.StartedAt = &startedAt.Time
	}
	if completedAt.Valid {
		t.CompletedAt = &completedAt.Time
	}
	t.Duration = computeDuration(t.StartedAt, t.CompletedAt, t.Status)
	return t, nil
}

// scanTaskRow scans a task from *sql.Rows.
func (q *Queue) scanTaskRow(rows *sql.Rows) (*TaskInfo, error) {
	t := &TaskInfo{}
	var startedAt, completedAt sql.NullTime
	err := rows.Scan(
		&t.ID, &t.Type, &t.Name, &t.Status, &t.Progress,
		&t.Log, &t.Result, &t.Error, &t.CreatedBy,
		&startedAt, &completedAt, &t.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to scan task: %w", err)
	}
	if startedAt.Valid {
		t.StartedAt = &startedAt.Time
	}
	if completedAt.Valid {
		t.CompletedAt = &completedAt.Time
	}
	t.Duration = computeDuration(t.StartedAt, t.CompletedAt, t.Status)
	return t, nil
}

// computeDuration calculates a human-readable duration string.
// For completed tasks it uses started_at → completed_at; for running tasks it uses started_at → now.
func computeDuration(startedAt, completedAt *time.Time, status TaskStatus) string {
	if startedAt == nil {
		return ""
	}
	end := time.Now()
	if completedAt != nil {
		end = *completedAt
	}
	d := end.Sub(*startedAt)
	if d < 0 {
		return "0s"
	}
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm%ds", int(d.Minutes()), int(d.Seconds())%60)
	}
	return fmt.Sprintf("%dh%dm%ds", int(d.Hours()), int(d.Minutes())%60, int(d.Seconds())%60)
}
