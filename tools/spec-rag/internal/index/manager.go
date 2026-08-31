package index

import (
	"context"
	"sync"

	"github.com/Reilley64/mtgscan/tools/spec-rag/internal/specparse"
)

type Manager struct {
	repoRoot string
	mu       sync.Mutex
	store    *Store
}

func NewManager(repoRoot string) *Manager { return &Manager{repoRoot: repoRoot} }

func (m *Manager) Search(ctx context.Context, query string, filters SearchFilters) ([]SearchRecord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	store, err := m.currentLocked(ctx)
	if err != nil {
		return nil, err
	}
	return store.Search(ctx, query, filters)
}
func (m *Manager) GetRequirement(ctx context.Context, id string) (RequirementDetail, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	store, err := m.currentLocked(ctx)
	if err != nil {
		return RequirementDetail{}, err
	}
	return store.GetRequirement(ctx, id)
}
func (m *Manager) GetFeature(ctx context.Context, slug string) (FeatureDetail, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	store, err := m.currentLocked(ctx)
	if err != nil {
		return FeatureDetail{}, err
	}
	return store.GetFeature(ctx, slug)
}
func (m *Manager) EvidenceGaps(ctx context.Context, feature string, statuses []string, limit int) ([]RequirementDetail, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	store, err := m.currentLocked(ctx)
	if err != nil {
		return nil, err
	}
	return store.EvidenceGaps(ctx, feature, statuses, limit)
}
func (m *Manager) Status(ctx context.Context) (Status, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	store, err := m.currentLocked(ctx)
	if err != nil {
		return Status{}, err
	}
	return store.Status(), nil
}
func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.store == nil {
		return nil
	}
	err := m.store.Close()
	m.store = nil
	return err
}
func (m *Manager) currentLocked(ctx context.Context) (*Store, error) {
	sources, err := specparse.ReadSources(m.repoRoot)
	if err != nil {
		return nil, err
	}
	digest, _, err := DigestSources(sources)
	if err != nil {
		return nil, err
	}
	if m.store != nil && m.store.Status().Digest == digest {
		return m.store, nil
	}
	specs, err := specparse.ParseSources(sources)
	if err != nil {
		return nil, err
	}
	if err := specparse.ValidateAll(specs); err != nil {
		return nil, err
	}
	next, err := newStore(ctx, digest, specs)
	if err != nil {
		return nil, err
	}
	old := m.store
	m.store = next
	if old != nil {
		_ = old.Close()
	}
	return next, nil
}
