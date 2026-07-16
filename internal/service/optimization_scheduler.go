package service

import (
	"context"
	"database/sql"
	"sync"
	"time"

	"github.com/ITDLUPanel/panel/internal/pkg/logger"
)

// OptimizationScheduler runs the optimization engine periodically in the background
type OptimizationScheduler struct {
	optService *OptimizationService
	optEngine *OptimizationEngine
	interval  time.Duration
	cancel    context.CancelFunc
	wg        sync.WaitGroup
	mu        sync.Mutex
	running   bool
}

// NewOptimizationScheduler creates a new OptimizationScheduler
func NewOptimizationScheduler(db *sql.DB) *OptimizationScheduler {
	return &OptimizationScheduler{
		optService: NewOptimizationService(db),
		optEngine: NewOptimizationEngine(NewOptimizationService(db)),
		interval:  5 * time.Minute,
	}
}

// Start begins the background optimization loop
func (s *OptimizationScheduler) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	s.running = true

	s.wg.Add(1)
	go s.runLoop(ctx)

	logger.Info().
		Dur("interval", s.interval).
		Msg("Optimization scheduler started")
}

// Stop gracefully shuts down the optimization loop
func (s *OptimizationScheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.running {
		return
	}
	s.cancel()
	s.wg.Wait()
	s.running = false
	logger.Info().Msg("Optimization scheduler stopped")
}

// runLoop runs the optimization check periodically
func (s *OptimizationScheduler) runLoop(ctx context.Context) {
	defer s.wg.Done()

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	// Run initial check
	s.runOptimizationCheck()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.runOptimizationCheck()
		}
	}
}

// runOptimizationCheck performs the optimization analysis
func (s *OptimizationScheduler) runOptimizationCheck() {
	mode, err := s.optService.GetMode()
	if err != nil {
		logger.Debug().Err(err).Msg("Failed to get optimization mode")
		return
	}

	if mode != ModeAdaptive {
		return
	}

	adaptiveSettings, err := s.optService.GetAdaptiveSettings()
	if err != nil || !adaptiveSettings.Enabled {
		return
	}

	logger.Debug().Msg("Running optimization analysis...")
	s.optEngine.AnalyzeAndOptimize()
}

// SetInterval changes the check interval
func (s *OptimizationScheduler) SetInterval(interval time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.interval = interval
}
