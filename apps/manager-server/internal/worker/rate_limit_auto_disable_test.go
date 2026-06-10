package worker

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	collectorpkg "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/collector"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/model"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/usage"
)

func TestQuotaAutoDisableCandidateRequiresStrictCodexUsageLimit(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	base := usage.Event{
		EventHash:        "evt-1",
		Failed:           true,
		FailStatusCode:   http.StatusTooManyRequests,
		FailBody:         `{"error":{"type":"usage_limit_reached","resets_in_seconds":60}}`,
		AuthFileSnapshot: "codex-auth.json",
		AuthIndex:        "auth-1",
		AccountSnapshot:  "user@example.com",
		Provider:         "codex",
	}

	candidate, ok := quotaAutoDisableCandidateFromEvent(base, "http://cpa", "key", now)
	if !ok {
		t.Fatalf("candidate not detected")
	}
	if candidate.FileName != "codex-auth.json" || candidate.AuthIndex != "auth-1" || candidate.DisplayAccount != "user@example.com" {
		t.Fatalf("candidate identity = %#v", candidate)
	}
	if got := candidate.ResetAt.Unix(); got != 1_700_000_060 {
		t.Fatalf("reset unix = %d", got)
	}

	cases := []struct {
		name   string
		mutate func(*usage.Event)
	}{
		{
			name: "broad quota exhausted text is ignored",
			mutate: func(event *usage.Event) {
				event.FailBody = `{"error":{"code":"quota_exhausted","message":"quota exhausted","resets_in_seconds":60}}`
			},
		},
		{
			name: "non 429 is ignored",
			mutate: func(event *usage.Event) {
				event.FailStatusCode = http.StatusPaymentRequired
			},
		},
		{
			name: "non codex provider is ignored",
			mutate: func(event *usage.Event) {
				event.Provider = "openai"
			},
		},
		{
			name: "missing explicit reset is ignored",
			mutate: func(event *usage.Event) {
				event.FailBody = `{"error":{"type":"usage_limit_reached"}}`
			},
		},
		{
			name: "legacy reset_at is ignored",
			mutate: func(event *usage.Event) {
				event.FailBody = `{"error":{"type":"usage_limit_reached","reset_at":1700000060}}`
			},
		},
		{
			name: "auth file snapshot required",
			mutate: func(event *usage.Event) {
				event.AuthFileSnapshot = ""
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			event := base
			tc.mutate(&event)
			if _, ok := quotaAutoDisableCandidateFromEvent(event, "http://cpa", "key", now); ok {
				t.Fatalf("candidate should not be detected")
			}
		})
	}
}

func TestRateLimitAutoDisableWorkerPersistsAndRecoversAfterRestart(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	var mu sync.Mutex
	disabled := false
	type action struct {
		Name     string `json:"name"`
		Disabled bool   `json:"disabled"`
	}
	actions := make([]action, 0)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-management-key" {
			http.Error(w, "missing auth", http.StatusUnauthorized)
			return
		}
		if r.URL.Path != "/auth-files" {
			http.NotFound(w, r)
			return
		}
		switch r.Method {
		case http.MethodGet:
			mu.Lock()
			currentDisabled := disabled
			mu.Unlock()
			_ = json.NewEncoder(w).Encode([]map[string]any{{
				"name":      "codex-auth.json",
				"authIndex": "auth-1",
				"disabled":  currentDisabled,
			}})
		case http.MethodPatch:
			var item action
			if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			mu.Lock()
			disabled = item.Disabled
			actions = append(actions, item)
			mu.Unlock()
			w.WriteHeader(http.StatusOK)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	ctx := context.Background()
	worker := NewRateLimitAutoDisableWorker(st, collectorpkg.RuntimeConfig{CPAUpstreamURL: server.URL, ManagementKey: "test-management-key"})
	worker.handleCandidate(ctx, quotaAutoDisableCandidate{
		BaseURL:        server.URL,
		ManagementKey:  "test-management-key",
		FileName:       "codex-auth.json",
		AuthIndex:      "auth-1",
		DisplayAccount: "user@example.com",
		Provider:       "codex",
		ResetAt:        time.Now().Add(time.Minute),
		EventHash:      "evt-quota",
	})

	mu.Lock()
	if len(actions) != 1 || actions[0].Name != "codex-auth.json" || !actions[0].Disabled || !disabled {
		t.Fatalf("disable actions = %#v disabled=%v", actions, disabled)
	}
	mu.Unlock()
	active, err := st.QuotaCooldowns.ListActive(ctx)
	if err != nil {
		t.Fatalf("list active cooldowns: %v", err)
	}
	if len(active) != 1 {
		t.Fatalf("active cooldowns = %#v", active)
	}
	if active[0].Owner != model.QuotaCooldownOwnerUsage429 || active[0].PreDisabledState {
		t.Fatalf("cooldown ownership = %#v", active[0])
	}

	// Simulate a process restart: a fresh worker recovers from the persisted record.
	restarted := NewRateLimitAutoDisableWorker(st, collectorpkg.RuntimeConfig{CPAUpstreamURL: server.URL, ManagementKey: "test-management-key"})
	restarted.enableDue(ctx, time.Now().Add(2*time.Minute))

	mu.Lock()
	defer mu.Unlock()
	if len(actions) != 2 {
		t.Fatalf("actions = %#v, want disable and enable", actions)
	}
	if actions[1].Name != "codex-auth.json" || actions[1].Disabled || disabled {
		t.Fatalf("enable action = %#v disabled=%v", actions[1], disabled)
	}
}
