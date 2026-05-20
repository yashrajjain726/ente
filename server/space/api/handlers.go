package api

import "github.com/ente-io/museum/space/controller"

type Handlers struct {
	Module *controller.Module
}

func NewHandlers(module *controller.Module) *Handlers {
	return &Handlers{Module: module}
}
