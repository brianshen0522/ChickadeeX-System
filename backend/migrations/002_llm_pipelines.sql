-- Migration: Add llm_pipelines table for two-stage LLM pipeline support
-- Run against an existing database that already has init.sql applied.

SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS llm_pipelines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100,
    enabled BOOLEAN DEFAULT true,

    -- Stage 1 configuration
    stage1_model_name VARCHAR(100) NOT NULL,
    stage1_api_url TEXT NOT NULL,
    stage1_api_key TEXT NOT NULL,
    stage1_prompt TEXT,
    stage1_max_tokens INTEGER DEFAULT 2000,
    stage1_temperature DECIMAL(3,2) DEFAULT 0.7,
    stage1_top_p DECIMAL(3,2) DEFAULT 1.0,
    stage1_include_image BOOLEAN DEFAULT true,

    -- Stage 2 configuration
    stage2_model_name VARCHAR(100) NOT NULL,
    stage2_api_url TEXT NOT NULL,
    stage2_api_key TEXT NOT NULL,
    stage2_prompt TEXT,
    stage2_max_tokens INTEGER DEFAULT 2000,
    stage2_temperature DECIMAL(3,2) DEFAULT 0.7,
    stage2_top_p DECIMAL(3,2) DEFAULT 1.0,
    stage2_include_image BOOLEAN DEFAULT false,

    -- Audit columns
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for unified priority-based failover queries
CREATE INDEX IF NOT EXISTS idx_llm_pipelines_enabled_priority ON llm_pipelines (enabled, priority);

-- Auto-update updated_at trigger
CREATE TRIGGER update_llm_pipelines_updated_at
    BEFORE UPDATE ON llm_pipelines
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Nullify audit FKs if referenced user is deleted (matches init.sql pattern for llm_configs)
-- This is handled by the deleteUser transaction in adminService.js; add the cleanup statements there.
