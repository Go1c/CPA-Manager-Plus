package proxy

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	managercfg "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/config"
	managerconfig "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/service/managerconfig"
)

func TestSaveAuthFileProxyTestFailureDoesNotPatch(t *testing.T) {
	patchCalled := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v0/management/proxy/test":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"ok":false,"code":"proxy_config_invalid","stage":"config","message":"invalid proxy"}`))
		case "/v0/management/auth-files/fields":
			patchCalled = true
			w.WriteHeader(http.StatusOK)
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	service := New(managerconfig.New(managercfg.Config{CPAUpstreamURL: upstream.URL, ManagementKey: "test-key"}, nil, nil))
	request := httptest.NewRequest(http.MethodPost, authProxySavePath, strings.NewReader(`{"name":"codex.json","provider":"codex","fields":{"proxy_url":"socks5:user:pass@host:443"}}`))
	recorder := httptest.NewRecorder()
	service.SaveAuthFileProxy(recorder, request, testWriteError)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
	if patchCalled {
		t.Fatal("auth file patch must not run after a failed proxy test")
	}
}

func TestSaveAuthFileProxyTestsThenPatches(t *testing.T) {
	order := make([]string, 0, 2)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		order = append(order, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v0/management/proxy/test":
			_, _ = w.Write([]byte(`{"ok":true,"code":"proxy_test_ok","proxy":"socks5://redacted@host:443","cloudflare_pop":"EWR","timings_ms":{"total":15}}`))
		case "/v0/management/auth-files/fields":
			_, _ = w.Write([]byte(`{"status":"ok"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	service := New(managerconfig.New(managercfg.Config{CPAUpstreamURL: upstream.URL, ManagementKey: "test-key"}, nil, nil))
	request := httptest.NewRequest(http.MethodPost, authProxySavePath, strings.NewReader(`{"name":"codex.json","provider":"codex","fields":{"proxy_url":"socks5://user:pass@host:443","prefix":"team"}}`))
	recorder := httptest.NewRecorder()
	service.SaveAuthFileProxy(recorder, request, testWriteError)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if len(order) != 2 || order[0] != "/v0/management/proxy/test" || order[1] != "/v0/management/auth-files/fields" {
		t.Fatalf("request order = %#v", order)
	}
	if strings.Contains(recorder.Body.String(), "user") || strings.Contains(recorder.Body.String(), "pass") {
		t.Fatalf("response exposed proxy credentials: %s", recorder.Body.String())
	}
}

func testWriteError(w http.ResponseWriter, status int, err error) {
	http.Error(w, err.Error(), status)
}
