package service

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"

	apperrors "github.com/ITDLUPanel/panel/internal/pkg/errors"
	"github.com/ITDLUPanel/panel/internal/pkg/logger"
	"github.com/ITDLUPanel/panel/internal/system"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// RedisClient represents a connected Redis client.
type RedisClient struct {
	ID    string `json:"id"`
	Addr  string `json:"addr"`
	Name  string `json:"name"`
	Age   int64  `json:"age"`
	Idle  int64  `json:"idle"`
	DB    int    `json:"db"`
	Cmd   string `json:"cmd"`
	Flags string `json:"flags"`
}

// RedisSlowLog represents a Redis slow log entry.
type RedisSlowLog struct {
	ID         int64    `json:"id"`
	Timestamp  int64    `json:"timestamp"`
	Duration   int64    `json:"duration"`
	Command    []string `json:"command"`
	ClientAddr string   `json:"client_addr"`
	ClientName string   `json:"client_name"`
}

// RedisMemoryStats holds Redis memory usage information.
type RedisMemoryStats struct {
	UsedMemory          int64  `json:"used_memory"`
	UsedMemoryHuman     string `json:"used_memory_human"`
	UsedMemoryPeak      int64  `json:"used_memory_peak"`
	UsedMemoryPeakHuman string `json:"used_memory_peak_human"`
	MaxMemory           int64  `json:"max_memory"`
	MaxMemoryHuman      string `json:"max_memory_human"`
	MaxMemoryPolicy     string `json:"max_memory_policy"`
	MemFragRatio        string `json:"mem_frag_ratio"`
}

// RedisPersistence holds Redis persistence information.
type RedisPersistence struct {
	RDBEnabled           bool   `json:"rdb_enabled"`
	RDBLastSaveTime      int64  `json:"rdb_last_save_time"`
	RDBLastStatus        string `json:"rdb_last_status"`
	RDBCurrentSave       bool   `json:"rdb_current_save"`
	AOFEnabled           bool   `json:"aof_enabled"`
	AOFLastRewriteStatus string `json:"aof_last_rewrite_status"`
	AOFCurrentSize       int64  `json:"aof_current_size"`
	AOFBaseSize          int64  `json:"aof_base_size"`
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// RedisService manages Redis server operations.
type RedisService struct{}

// NewRedisService creates a new RedisService.
func NewRedisService() *RedisService {
	return &RedisService{}
}

// redisConfigPath returns the path to the Redis configuration file.
func redisConfigPath() string {
	paths := []string{
		"/ITDLUPanel/server/redis/conf/redis.conf",
		"/etc/redis/redis.conf",
		"/etc/redis.conf",
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return "/etc/redis/redis.conf"
}

// redisServiceName detects the systemd service name for Redis.
func redisServiceName() string {
	ctx := context.Background()
	for _, name := range []string{"redis-server", "redis"} {
		if r, _ := system.Exec(ctx, "systemctl", "is-enabled", name); r != nil && r.ExitCode == 0 {
			return name
		}
	}
	return "redis-server"
}

// parseRedisInfo parses the output of redis-cli INFO into a key-value map.
func parseRedisInfo(output string) map[string]string {
	info := make(map[string]string)
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if idx := strings.IndexByte(line, ':'); idx > 0 {
			info[line[:idx]] = line[idx+1:]
		}
	}
	return info
}

// GetInfo runs redis-cli INFO and returns parsed key-value pairs.
func (s *RedisService) GetInfo() (map[string]string, error) {
	ctx := context.Background()
	result, err := system.Exec(ctx, "redis-cli", "INFO")
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get redis info")
	}
	return parseRedisInfo(result.Stdout), nil
}

// GetConfig runs redis-cli CONFIG GET * and returns parsed key-value pairs.
func (s *RedisService) GetConfig() (map[string]string, error) {
	ctx := context.Background()
	result, err := system.Exec(ctx, "redis-cli", "CONFIG", "GET", "*")
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get redis config")
	}

	cfg := make(map[string]string)
	lines := strings.Split(strings.TrimSpace(result.Stdout), "\n")
	for i := 0; i+1 < len(lines); i += 2 {
		key := strings.TrimSpace(lines[i])
		val := strings.TrimSpace(lines[i+1])
		if key != "" {
			cfg[key] = val
		}
	}
	return cfg, nil
}

// SetConfig sets a Redis configuration parameter and rewrites the config file.
func (s *RedisService) SetConfig(key, value string) error {
	ctx := context.Background()
	if _, err := system.Exec(ctx, "redis-cli", "CONFIG", "SET", key, value); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to set redis config")
	}
	if _, err := system.Exec(ctx, "redis-cli", "CONFIG", "REWRITE"); err != nil {
		logger.Warn().Err(err).Msg("redis CONFIG REWRITE failed")
	}
	logger.Info().Str("key", key).Msg("redis config updated")
	return nil
}

// GetConfigFile reads the Redis configuration file and returns its content.
func (s *RedisService) GetConfigFile() (string, error) {
	data, err := os.ReadFile(redisConfigPath())
	if err != nil {
		return "", apperrors.Wrap(err, apperrors.ErrInternal, "failed to read redis config file")
	}
	return string(data), nil
}

// SaveConfigFile writes content to the Redis configuration file and reloads Redis.
func (s *RedisService) SaveConfigFile(content string) error {
	path := redisConfigPath()
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to write redis config file")
	}

	ctx := context.Background()
	svc := redisServiceName()
	if _, err := system.Exec(ctx, "systemctl", "reload", svc); err != nil {
		// Some Redis versions don't support reload; try restart.
		if _, err2 := system.Exec(ctx, "systemctl", "restart", svc); err2 != nil {
			return apperrors.Wrap(err2, apperrors.ErrInternal, "failed to reload redis after config save")
		}
	}

	logger.Info().Str("path", path).Msg("redis config file saved and service reloaded")
	return nil
}

// GetClients runs redis-cli CLIENT LIST and parses each client's info.
func (s *RedisService) GetClients() ([]RedisClient, error) {
	ctx := context.Background()
	result, err := system.Exec(ctx, "redis-cli", "CLIENT", "LIST")
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get redis clients")
	}

	var clients []RedisClient
	for _, line := range strings.Split(result.Stdout, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := make(map[string]string)
		for _, part := range strings.Fields(line) {
			if idx := strings.IndexByte(part, '='); idx > 0 {
				fields[part[:idx]] = part[idx+1:]
			}
		}

		client := RedisClient{
			ID:    fields["id"],
			Addr:  fields["addr"],
			Name:  fields["name"],
			Cmd:   fields["cmd"],
			Flags: fields["flags"],
		}
		client.Age, _ = strconv.ParseInt(fields["age"], 10, 64)
		client.Idle, _ = strconv.ParseInt(fields["idle"], 10, 64)
		client.DB, _ = strconv.Atoi(fields["db"])

		clients = append(clients, client)
	}
	return clients, nil
}

// KillClient kills a Redis client by ID.
func (s *RedisService) KillClient(id string) error {
	ctx := context.Background()
	if _, err := system.Exec(ctx, "redis-cli", "CLIENT", "KILL", "ID", id); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to kill redis client")
	}
	logger.Info().Str("client_id", id).Msg("redis client killed")
	return nil
}

// FlushDB flushes all keys from the given Redis database.
func (s *RedisService) FlushDB(db int) error {
	ctx := context.Background()
	if _, err := system.Exec(ctx, "redis-cli", "-n", strconv.Itoa(db), "FLUSHDB"); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, fmt.Sprintf("failed to flush redis db %d", db))
	}
	logger.Info().Int("db", db).Msg("redis database flushed")
	return nil
}

// FlushAll flushes all keys from all Redis databases.
func (s *RedisService) FlushAll() error {
	ctx := context.Background()
	if _, err := system.Exec(ctx, "redis-cli", "FLUSHALL"); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to flush all redis databases")
	}
	logger.Info().Msg("all redis databases flushed")
	return nil
}

// GetDBSize returns the number of keys per Redis database.
func (s *RedisService) GetDBSize() (map[int]int64, error) {
	ctx := context.Background()
	result, err := system.Exec(ctx, "redis-cli", "INFO", "keyspace")
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get redis keyspace info")
	}

	sizes := make(map[int]int64)
	for _, line := range strings.Split(result.Stdout, "\n") {
		line = strings.TrimSpace(line)
		// Lines look like: db0:keys=123,expires=0,avg_ttl=0
		if !strings.HasPrefix(line, "db") {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		dbNum, err := strconv.Atoi(strings.TrimPrefix(parts[0], "db"))
		if err != nil {
			continue
		}
		for _, kv := range strings.Split(parts[1], ",") {
			if strings.HasPrefix(kv, "keys=") {
				count, _ := strconv.ParseInt(strings.TrimPrefix(kv, "keys="), 10, 64)
				sizes[dbNum] = count
				break
			}
		}
	}
	return sizes, nil
}

// GetSlowLog runs redis-cli SLOWLOG GET and parses the result.
func (s *RedisService) GetSlowLog(count int) ([]RedisSlowLog, error) {
	ctx := context.Background()
	result, err := system.Exec(ctx, "redis-cli", "SLOWLOG", "GET", strconv.Itoa(count))
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get redis slow log")
	}

	var logs []RedisSlowLog
	lines := strings.Split(strings.TrimSpace(result.Stdout), "\n")

	// redis-cli output for SLOWLOG GET is a numbered list of entries.
	// Each entry spans multiple lines:
	//  1) (integer) <id>
	//  2) (integer) <timestamp>
	//  3) (integer) <duration>
	//  4) 1) "command"
	//     2) "arg1" ...
	//  5) "client_addr"
	//  6) "client_name"
	//
	// We parse the raw text output from redis-cli which is formatted as:
	// <id>
	// <timestamp>
	// <duration>
	// <command parts...>
	// <client_addr>
	// <client_name>
	//
	// However, redis-cli output format varies. A more reliable approach is
	// to use a simpler parse of the structured output.

	var current *RedisSlowLog
	fieldIdx := 0

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Skip redis-cli decoration like numbers with parentheses
		cleaned := line
		// Strip leading index markers like "1) ", " 1) "
		for len(cleaned) > 0 && (cleaned[0] == ' ' || cleaned[0] == '\t') {
			cleaned = cleaned[1:]
		}

		// Detect entry boundaries — lines that are just an integer (entry ID marker)
		if strings.HasPrefix(cleaned, "(integer)") {
			val := strings.TrimSpace(strings.TrimPrefix(cleaned, "(integer)"))
			num, err := strconv.ParseInt(val, 10, 64)
			if err != nil {
				continue
			}

			switch fieldIdx % 3 {
			case 0:
				if current != nil {
					logs = append(logs, *current)
				}
				current = &RedisSlowLog{ID: num}
				fieldIdx = 1
			case 1:
				if current != nil {
					current.Timestamp = num
				}
				fieldIdx = 2
			case 2:
				if current != nil {
					current.Duration = num
				}
				fieldIdx = 3
			}
			continue
		}

		// Command arguments and client info (quoted strings)
		if current != nil && fieldIdx >= 3 {
			val := strings.Trim(cleaned, "\"")
			// Strip leading list markers like "1) "
			if idx := strings.Index(val, ") "); idx >= 0 && idx <= 3 {
				val = strings.Trim(val[idx+2:], "\"")
			}
			if val != "" {
				current.Command = append(current.Command, val)
			}
		}
	}
	if current != nil {
		logs = append(logs, *current)
	}

	return logs, nil
}

// GetMemoryStats parses the memory section from redis-cli INFO.
func (s *RedisService) GetMemoryStats() (*RedisMemoryStats, error) {
	ctx := context.Background()
	result, err := system.Exec(ctx, "redis-cli", "INFO", "memory")
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get redis memory info")
	}

	info := parseRedisInfo(result.Stdout)
	stats := &RedisMemoryStats{
		UsedMemoryHuman:     info["used_memory_human"],
		UsedMemoryPeakHuman: info["used_memory_peak_human"],
		MaxMemoryHuman:      info["maxmemory_human"],
		MaxMemoryPolicy:     info["maxmemory_policy"],
		MemFragRatio:        info["mem_fragmentation_ratio"],
	}
	stats.UsedMemory, _ = strconv.ParseInt(info["used_memory"], 10, 64)
	stats.UsedMemoryPeak, _ = strconv.ParseInt(info["used_memory_peak"], 10, 64)
	stats.MaxMemory, _ = strconv.ParseInt(info["maxmemory"], 10, 64)

	return stats, nil
}

// SetPassword updates the Redis requirepass configuration.
func (s *RedisService) SetPassword(password string) error {
	ctx := context.Background()
	if _, err := system.Exec(ctx, "redis-cli", "CONFIG", "SET", "requirepass", password); err != nil {
		return apperrors.Wrap(err, apperrors.ErrInternal, "failed to set redis password")
	}
	if _, err := system.Exec(ctx, "redis-cli", "-a", password, "CONFIG", "REWRITE"); err != nil {
		logger.Warn().Err(err).Msg("redis CONFIG REWRITE failed after password change")
	}
	logger.Info().Msg("redis password updated")
	return nil
}

// GetPersistenceInfo parses persistence info from redis-cli INFO.
func (s *RedisService) GetPersistenceInfo() (*RedisPersistence, error) {
	ctx := context.Background()
	result, err := system.Exec(ctx, "redis-cli", "INFO", "persistence")
	if err != nil {
		return nil, apperrors.Wrap(err, apperrors.ErrInternal, "failed to get redis persistence info")
	}

	info := parseRedisInfo(result.Stdout)
	p := &RedisPersistence{
		RDBLastStatus:        info["rdb_last_bgsave_status"],
		RDBCurrentSave:       info["rdb_bgsave_in_progress"] == "1",
		AOFEnabled:           info["aof_enabled"] == "1",
		AOFLastRewriteStatus: info["aof_last_bgrewrite_status"],
	}

	p.RDBLastSaveTime, _ = strconv.ParseInt(info["rdb_last_save_time"], 10, 64)
	p.AOFCurrentSize, _ = strconv.ParseInt(info["aof_current_size"], 10, 64)
	p.AOFBaseSize, _ = strconv.ParseInt(info["aof_base_size"], 10, 64)

	// RDB is considered enabled if rdb_last_save_time > 0 or rdb_changes_since_last_save is present.
	if info["rdb_last_save_time"] != "" && info["rdb_last_save_time"] != "0" {
		p.RDBEnabled = true
	}
	if info["rdb_changes_since_last_save"] != "" {
		p.RDBEnabled = true
	}

	return p, nil
}
