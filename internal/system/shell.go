package system

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// ExecResult captures the output and exit status of a command.
type ExecResult struct {
	Stdout   string        `json:"stdout"`
	Stderr   string        `json:"stderr"`
	ExitCode int           `json:"exit_code"`
	Duration time.Duration `json:"duration"`
}

// Exec runs a command with the given context and returns its result.
func Exec(ctx context.Context, name string, args ...string) (*ExecResult, error) {
	logger.Debug().Str("cmd", name).Strs("args", args).Msg("executing command")

	start := time.Now()
	cmd := exec.CommandContext(ctx, name, args...)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	duration := time.Since(start)

	result := &ExecResult{
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
		ExitCode: cmd.ProcessState.ExitCode(),
		Duration: duration,
	}

	if err != nil {
		logger.Error().
			Err(err).
			Str("cmd", name).
			Strs("args", args).
			Int("exit_code", result.ExitCode).
			Str("stderr", result.Stderr).
			Msg("command failed")
		return result, err
	}

	return result, nil
}

// ExecWithTimeout runs a command with a timeout and returns its result.
func ExecWithTimeout(timeout time.Duration, name string, args ...string) (*ExecResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	return Exec(ctx, name, args...)
}

// ExecWithStdin runs a command with stdin input and returns its result.
func ExecWithStdin(ctx context.Context, stdin string, name string, args ...string) (*ExecResult, error) {
	logger.Debug().Str("cmd", name).Strs("args", args).Msg("executing command with stdin")

	start := time.Now()
	cmd := exec.CommandContext(ctx, name, args...)

	cmd.Stdin = strings.NewReader(stdin)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	duration := time.Since(start)

	result := &ExecResult{
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
		ExitCode: cmd.ProcessState.ExitCode(),
		Duration: duration,
	}

	if err != nil {
		logger.Error().
			Err(err).
			Str("cmd", name).
			Int("exit_code", result.ExitCode).
			Str("stderr", result.Stderr).
			Msg("command failed")
		return result, err
	}

	return result, nil
}

// ExecShell runs a command string via /bin/bash -c after basic validation.
func ExecShell(ctx context.Context, command string) (*ExecResult, error) {
	if err := ValidateCommand(command); err != nil {
		return nil, err
	}
	return Exec(ctx, "/bin/bash", "-c", command)
}

// dangerousPatterns lists shell meta-characters and sequences that could
// indicate command injection. This is a basic safety net, not a sandbox.
var dangerousPatterns = []string{
	";",
	"|",
	"&&",
	"||",
	"`",
	"$(",
	"${",
	"\n",
	"\r",
	">>",
}

// ValidateCommand performs a basic check against dangerous shell patterns.
func ValidateCommand(cmd string) error {
	trimmed := strings.TrimSpace(cmd)
	if trimmed == "" {
		return fmt.Errorf("empty command")
	}

	for _, pattern := range dangerousPatterns {
		if strings.Contains(trimmed, pattern) {
			return fmt.Errorf("potentially dangerous pattern %q detected in command", pattern)
		}
	}

	return nil
}
