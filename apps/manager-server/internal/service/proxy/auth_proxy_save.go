package proxy

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

const authProxySavePath = "/v0/management/auth-files/proxy-save"

type authProxySaveRequest struct {
	Name     string                     `json:"name"`
	Provider string                     `json:"provider"`
	Fields   map[string]json.RawMessage `json:"fields"`
}

func (s *Service) SaveAuthFileProxy(w http.ResponseWriter, r *http.Request, writeError func(http.ResponseWriter, int, error)) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	var request authProxySaveRequest
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1024*1024))
	if errDecode := decoder.Decode(&request); errDecode != nil {
		writeError(w, http.StatusBadRequest, errors.New("invalid request body"))
		return
	}
	request.Name = strings.TrimSpace(request.Name)
	request.Provider = strings.ToLower(strings.TrimSpace(request.Provider))
	if request.Name == "" {
		writeError(w, http.StatusBadRequest, errors.New("name is required"))
		return
	}
	rawProxyURL, okProxyURL := request.Fields["proxy_url"]
	if !okProxyURL {
		writeError(w, http.StatusBadRequest, errors.New("proxy_url is required"))
		return
	}
	var proxyURL string
	if errProxyURL := json.Unmarshal(rawProxyURL, &proxyURL); errProxyURL != nil {
		writeError(w, http.StatusBadRequest, errors.New("proxy_url must be a string"))
		return
	}
	if request.Provider == "" {
		request.Provider = "codex"
	}

	setup, ok, errSetup := s.resolveSetup(r.Context())
	if errSetup != nil {
		writeError(w, http.StatusInternalServerError, errSetup)
		return
	}
	if !ok {
		writeError(w, http.StatusPreconditionRequired, errors.New("usage service is not configured"))
		return
	}
	testPayload := map[string]any{
		"proxy_url": proxyURL,
		"provider":  request.Provider,
		"auth_file": request.Name,
	}
	testStatus, testBody, errTest := managementJSONRequest(r, setup.CPAUpstreamURL, setup.ManagementKey, http.MethodPost, "/v0/management/proxy/test", testPayload)
	if errTest != nil {
		writeError(w, http.StatusBadGateway, errTest)
		return
	}
	if testStatus < 200 || testStatus >= 300 || !proxyTestBodyOK(testBody) {
		writeJSONBytes(w, testStatus, testBody)
		return
	}

	patchPayload := make(map[string]json.RawMessage, len(request.Fields)+1)
	for key, value := range request.Fields {
		patchPayload[key] = value
	}
	encodedName, _ := json.Marshal(request.Name)
	patchPayload["name"] = encodedName
	patchStatus, patchBody, errPatch := managementJSONRequest(r, setup.CPAUpstreamURL, setup.ManagementKey, http.MethodPatch, "/v0/management/auth-files/fields", patchPayload)
	if errPatch != nil {
		writeError(w, http.StatusBadGateway, errPatch)
		return
	}
	if patchStatus < 200 || patchStatus >= 300 {
		writeJSONBytes(w, patchStatus, patchBody)
		return
	}

	var proxyTest any
	if errUnmarshal := json.Unmarshal(testBody, &proxyTest); errUnmarshal != nil {
		proxyTest = map[string]any{"ok": true, "code": "proxy_test_ok"}
	}
	response, _ := json.Marshal(map[string]any{"status": "ok", "proxy_test": proxyTest})
	writeJSONBytes(w, http.StatusOK, response)
}

func managementJSONRequest(r *http.Request, baseURL, managementKey, method, path string, payload any) (int, []byte, error) {
	data, errMarshal := json.Marshal(payload)
	if errMarshal != nil {
		return 0, nil, errMarshal
	}
	request, errRequest := http.NewRequestWithContext(r.Context(), method, strings.TrimRight(baseURL, "/")+path, bytes.NewReader(data))
	if errRequest != nil {
		return 0, nil, errRequest
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+managementKey)
	response, errDo := http.DefaultClient.Do(request)
	if errDo != nil {
		return 0, nil, errDo
	}
	defer response.Body.Close()
	body, errRead := io.ReadAll(io.LimitReader(response.Body, 1024*1024))
	if errRead != nil {
		return 0, nil, errRead
	}
	return response.StatusCode, body, nil
}

func proxyTestBodyOK(body []byte) bool {
	var payload struct {
		OK bool `json:"ok"`
	}
	return json.Unmarshal(body, &payload) == nil && payload.OK
}

func writeJSONBytes(w http.ResponseWriter, status int, body []byte) {
	if status <= 0 {
		status = http.StatusBadGateway
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
