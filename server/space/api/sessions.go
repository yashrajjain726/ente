package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/ente-io/museum/ente"
	"github.com/ente-io/museum/pkg/utils/auth"
	"github.com/ente-io/museum/space/controller"
	"github.com/ente-io/museum/space/models"
	"github.com/gin-gonic/gin"
)

const spaceBrowserSessionCookieMaxAgeSeconds = 365 * 24 * 60 * 60

func (h *Handlers) RequireSpaceBrowserSession() gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionToken, err := c.Cookie(controller.SpaceBrowserSessionCookieName)
		if err != nil || strings.TrimSpace(sessionToken) == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
			return
		}
		session, err := h.Module.Sessions.ValidateBrowserSession(c, sessionToken)
		if err != nil {
			if errors.Is(err, ente.ErrAuthenticationRequired) {
				clearSpaceBrowserSessionCookie(c)
			}
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid session"})
			return
		}
		c.Request.Header.Set("X-Auth-User-ID", strconv.FormatInt(session.UserID, 10))
		c.Next()
	}
}

func (h *Handlers) CreateBrowserSession(c *gin.Context) {
	var req models.SpaceBrowserSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondJSON(c, nil, ente.ErrBadRequest)
		return
	}
	userID := auth.GetUserID(c.Request.Header)
	if userID <= 0 {
		respondJSON(c, nil, ente.ErrAuthenticationRequired)
		return
	}
	created, err := h.Module.Sessions.CreateBrowserSession(c, userID, req.ClientKey)
	if err != nil {
		respondJSON(c, nil, err)
		return
	}
	if token := strings.TrimSpace(auth.GetToken(c)); token != "" {
		if h.Module.UserTokens != nil {
			if err := h.Module.UserTokens.TerminateSession(userID, token); err != nil {
				respondJSON(c, nil, err)
				return
			}
		} else if h.Module.UserAuth != nil {
			if err := h.Module.UserAuth.RemoveToken(userID, token); err != nil {
				respondJSON(c, nil, err)
				return
			}
		}
	}
	setSpaceBrowserSessionCookie(c, created.Token, spaceBrowserSessionCookieMaxAgeSeconds)
	respondJSON(c, created.Response, nil)
}

func (h *Handlers) BootstrapBrowserSession(c *gin.Context) {
	sessionToken, _ := c.Cookie(controller.SpaceBrowserSessionCookieName)
	resp, err := h.Module.Sessions.BootstrapBrowserSession(c, strings.TrimSpace(sessionToken))
	if errors.Is(err, ente.ErrAuthenticationRequired) {
		clearSpaceBrowserSessionCookie(c)
	}
	respondJSON(c, resp, err)
}

func (h *Handlers) DeleteBrowserSession(c *gin.Context) {
	sessionToken, _ := c.Cookie(controller.SpaceBrowserSessionCookieName)
	err := h.Module.Sessions.RevokeBrowserSession(c, strings.TrimSpace(sessionToken))
	clearSpaceBrowserSessionCookie(c)
	respondStatus(c, err)
}

func setSpaceBrowserSessionCookie(c *gin.Context, token string, maxAge int) {
	secure := shouldSetSecureSpaceCookie(c)
	sameSite := http.SameSiteLaxMode
	if secure {
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     controller.SpaceBrowserSessionCookieName,
		Value:    token,
		Path:     controller.SpaceBrowserSessionCookiePath,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	})
}

func clearSpaceBrowserSessionCookie(c *gin.Context) {
	setSpaceBrowserSessionCookie(c, "", -1)
}

func shouldSetSecureSpaceCookie(c *gin.Context) bool {
	if c.Request.TLS != nil {
		return true
	}
	return strings.HasPrefix(strings.TrimSpace(c.GetHeader("Origin")), "https://")
}
