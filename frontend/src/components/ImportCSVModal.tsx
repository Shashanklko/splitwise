import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AnomalyItem {
  row_index: number;
  anomaly_type: string;
  description: string;
  proposed_action: string;
  raw_row: Record<string, string>;
  resolved_row: Record<string, string | null> | null;
  user_decision: 'ACCEPT' | 'REJECT' | null;
  converted_amount?: string;
  conversion_rate?: string;
}

interface PreviewResult {
  total_rows: number;
  clean_rows: number;
  anomaly_count: number;
  anomalies: AnomalyItem[];
  ready_rows: Record<string, string>[];
  known_members: string[];
}

interface CommitResult {
  imported: number;
  skipped: number;
  errors: string[];
  total_processed: number;
}

// ── Anomaly type display config ────────────────────────────────────────────────

const ANOMALY_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  DUPLICATE_ENTRY:        { icon: '🔁', color: '#f59e0b', label: 'Duplicate Entry' },
  SETTLEMENT_AS_EXPENSE:  { icon: '💸', color: '#8b5cf6', label: 'Settlement as Expense' },
  CURRENCY_MISMATCH:      { icon: '💱', color: '#3b82f6', label: 'Foreign Currency (USD)' },
  NEGATIVE_AMOUNT:        { icon: '↩️', color: '#06b6d4', label: 'Negative Amount / Refund' },
  ZERO_AMOUNT:            { icon: '⚠️', color: '#6b7280', label: 'Zero Amount' },
  MISSING_PAID_BY:        { icon: '❓', color: '#ef4444', label: 'Unknown Payer' },
  PERCENTAGE_SUM_ERROR:   { icon: '📊', color: '#ec4899', label: 'Invalid % Split' },
  INVALID_DATE:           { icon: '📅', color: '#f97316', label: 'Invalid Date' },
  MEMBER_NOT_IN_GROUP:    { icon: '👤', color: '#14b8a6', label: 'Unknown Member' },
  MISSING_AMOUNT:         { icon: '🚫', color: '#dc2626', label: 'Missing Amount' },
  EX_MEMBER_EXPENSE:      { icon: '🚪', color: '#92400e', label: 'Ex-Member' },
  FUTURE_MEMBER_EXPENSE:  { icon: '⏳', color: '#1d4ed8', label: 'Pre-Membership' },
};

const PROPOSED_ACTION_LABELS: Record<string, string> = {
  SKIP:                      'Skip this row',
  CONVERT_TO_INR:            'Convert USD → ₹ at ₹83/USD',
  TREAT_AS_REFUND:           'Record as refund credit',
  CONVERT_TO_SETTLEMENT:     'Record as settlement',
  SPLIT_PAYMENT_EQUALLY:     'Split payment equally',
  NORMALIZE_PERCENTAGES:     'Normalize % to sum to 100',
  EXCLUDE_NON_MEMBER:        'Exclude non-member from split',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function AnomalyCard({
  anomaly,
  onDecision,
}: {
  anomaly: AnomalyItem;
  onDecision: (rowIndex: number, anomalyType: string, decision: 'ACCEPT' | 'REJECT') => void;
}) {
  const cfg = ANOMALY_CONFIG[anomaly.anomaly_type] || { icon: '⚠️', color: '#6b7280', label: anomaly.anomaly_type };
  const decided = anomaly.user_decision !== null;
  const accepted = anomaly.user_decision === 'ACCEPT';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      borderRadius: 12,
      border: `1px solid ${decided ? (accepted ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.3)') : 'rgba(255,255,255,0.08)'}`,
      padding: '14px 16px',
      marginBottom: 10,
      transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Badge */}
        <div style={{
          background: `${cfg.color}22`,
          border: `1px solid ${cfg.color}55`,
          borderRadius: 8,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 600,
          color: cfg.color,
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          minWidth: 'fit-content',
        }}>
          <span>{cfg.icon}</span>
          <span>{cfg.label}</span>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', lineHeight: 1.5 }}>
            {anomaly.description}
          </p>

          {/* Raw row preview */}
          <div style={{
            marginTop: 8,
            padding: '6px 10px',
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 6,
            fontSize: 11,
            color: '#94a3b8',
            fontFamily: 'monospace',
          }}>
            {['date', 'description', 'amount', 'currency', 'paid_by', 'split_with'].map(k => (
              anomaly.raw_row[k] ? (
                <span key={k} style={{ marginRight: 12 }}>
                  <span style={{ color: '#64748b' }}>{k}: </span>
                  <span style={{ color: '#cbd5e1' }}>{anomaly.raw_row[k]}</span>
                </span>
              ) : null
            ))}
          </div>

          {/* Proposed action */}
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Proposed:</span>
            <span style={{
              fontSize: 11,
              color: '#a78bfa',
              background: 'rgba(139,92,246,0.12)',
              padding: '2px 8px',
              borderRadius: 4,
            }}>
              {PROPOSED_ACTION_LABELS[anomaly.proposed_action] || anomaly.proposed_action}
            </span>
            {anomaly.converted_amount && (
              <span style={{ fontSize: 11, color: '#34d399' }}>
                → ₹{parseFloat(anomaly.converted_amount).toLocaleString('en-IN')}
              </span>
            )}
          </div>
        </div>

        {/* Decision buttons */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => onDecision(anomaly.row_index, anomaly.anomaly_type, 'ACCEPT')}
            style={{
              padding: '5px 14px',
              borderRadius: 6,
              border: '1px solid',
              borderColor: accepted ? '#22c55e' : 'rgba(34,197,94,0.3)',
              background: accepted ? 'rgba(34,197,94,0.2)' : 'transparent',
              color: '#22c55e',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            ✓ Accept
          </button>
          <button
            onClick={() => onDecision(anomaly.row_index, anomaly.anomaly_type, 'REJECT')}
            style={{
              padding: '5px 14px',
              borderRadius: 6,
              border: '1px solid',
              borderColor: (!accepted && decided) ? '#ef4444' : 'rgba(239,68,68,0.3)',
              background: (!accepted && decided) ? 'rgba(239,68,68,0.2)' : 'transparent',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            ✗ Skip
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface ImportCSVModalProps {
  groupId: number;
  groupName: string;
  onClose: () => void;
  onImportComplete: () => void;
}

type Step = 'upload' | 'review' | 'result';

export default function ImportCSVModal({
  groupId,
  groupName,
  onClose,
  onImportComplete,
}: ImportCSVModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [filter, setFilter] = useState<string>('ALL');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File selection ─────────────────────────────────────────────────────────

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.name.endsWith('.csv')) {
      setFile(dropped);
      setError(null);
    } else {
      setError('Please drop a .csv file');
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError(null);
    }
  };

  // ── Preview call ───────────────────────────────────────────────────────────

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('group_id', String(groupId));

      const token = localStorage.getItem('access_token');
      const res = await axios.post(`${API}/api/import/preview`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      const data: PreviewResult = res.data;
      setPreview(data);
      // Initialize all anomalies with null decision
      setAnomalies(data.anomalies.map(a => ({ ...a, user_decision: null })));
      setStep('review');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setError(err.response?.data?.detail || err.message || 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Decision handler ────────────────────────────────────────────────────────

  const handleDecision = (rowIndex: number, anomalyType: string, decision: 'ACCEPT' | 'REJECT') => {
    setAnomalies(prev => prev.map(a =>
      a.row_index === rowIndex && a.anomaly_type === anomalyType
        ? { ...a, user_decision: decision }
        : a
    ));
  };

  const handleAcceptAll = () => {
    setAnomalies(prev => prev.map(a =>
      // Don't auto-accept SKIP-proposed anomalies like DUPLICATE / ZERO_AMOUNT
      ['DUPLICATE_ENTRY', 'ZERO_AMOUNT', 'MISSING_AMOUNT', 'INVALID_DATE'].includes(a.anomaly_type)
        ? { ...a, user_decision: 'REJECT' }
        : { ...a, user_decision: 'ACCEPT' }
    ));
  };

  // ── Commit call ────────────────────────────────────────────────────────────

  const handleCommit = async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('access_token');
      const res = await axios.post(
        `${API}/api/import/commit`,
        {
          group_id: groupId,
          ready_rows: preview.ready_rows,
          resolved_anomalies: anomalies,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCommitResult(res.data);
      setStep('result');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setError(err.response?.data?.detail || err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Stats ───────────────────────────────────────────────────────────────────

  const decided = anomalies.filter(a => a.user_decision !== null).length;
  const accepted = anomalies.filter(a => a.user_decision === 'ACCEPT').length;
  const allDecided = anomalies.length > 0 && decided === anomalies.length;

  const anomalyTypes = ['ALL', ...Array.from(new Set(anomalies.map(a => a.anomaly_type)))];
  const filteredAnomalies = filter === 'ALL' ? anomalies : anomalies.filter(a => a.anomaly_type === filter);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.1)',
        width: '100%',
        maxWidth: step === 'review' ? 780 : 520,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>
              {step === 'upload' && '📂 Import Expenses from CSV'}
              {step === 'review' && '🔍 Review Anomalies'}
              {step === 'result' && '✅ Import Complete'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
              {groupName}
              {step === 'review' && preview && (
                <span style={{ marginLeft: 8 }}>
                  · {preview.total_rows} rows · {preview.anomaly_count} flagged · {preview.clean_rows} clean
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 18,
            width: 32,
            height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* Step indicator */}
        <div style={{
          display: 'flex',
          gap: 0,
          padding: '0 24px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          flexShrink: 0,
        }}>
          {(['upload', 'review', 'result'] as Step[]).map((s, i) => (
            <div key={s} style={{
              padding: '10px 0',
              marginRight: 24,
              fontSize: 12,
              fontWeight: 600,
              color: step === s ? '#a78bfa' : (
                ['upload', 'review', 'result'].indexOf(step) > i ? '#22c55e' : '#374151'
              ),
              borderBottom: `2px solid ${step === s ? '#a78bfa' : 'transparent'}`,
            }}>
              {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>

          {/* ── STEP 1: Upload ── */}
          {step === 'upload' && (
            <div>
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? '#a78bfa' : file ? '#22c55e' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 14,
                  padding: '40px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragging ? 'rgba(167,139,250,0.05)' : file ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.02)',
                  transition: 'all 0.2s',
                }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>{file ? '✅' : '📤'}</div>
                {file ? (
                  <>
                    <p style={{ margin: 0, color: '#22c55e', fontWeight: 600, fontSize: 15 }}>{file.name}</p>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12 }}>
                      {(file.size / 1024).toFixed(1)} KB · Click to change
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ margin: 0, color: '#94a3b8', fontWeight: 600, fontSize: 15 }}>
                      Drop your CSV file here
                    </p>
                    <p style={{ margin: '4px 0 0', color: '#475569', fontSize: 12 }}>
                      or click to browse · expenses_export.csv
                    </p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
              </div>

              {/* Expected format hint */}
              <div style={{
                marginTop: 16,
                padding: '12px 16px',
                background: 'rgba(59,130,246,0.06)',
                border: '1px solid rgba(59,130,246,0.15)',
                borderRadius: 10,
              }}>
                <p style={{ margin: 0, fontSize: 12, color: '#93c5fd', fontWeight: 600 }}>Expected CSV columns:</p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                  date, description, amount, currency, paid_by, split_with, split_type, split_details, notes
                </p>
              </div>

              {error && (
                <div style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 8,
                  color: '#fca5a5',
                  fontSize: 13,
                }}>
                  {error}
                </div>
              )}

              <button
                onClick={handlePreview}
                disabled={!file || loading}
                style={{
                  marginTop: 20,
                  width: '100%',
                  padding: '14px',
                  borderRadius: 12,
                  border: 'none',
                  background: file ? 'linear-gradient(135deg, #7c3aed, #4f46e5)' : 'rgba(255,255,255,0.05)',
                  color: file ? '#fff' : '#374151',
                  cursor: file ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  fontSize: 15,
                  transition: 'all 0.2s',
                }}
              >
                {loading ? 'Analysing…' : 'Analyse & Preview →'}
              </button>
            </div>
          )}

          {/* ── STEP 2: Review ── */}
          {step === 'review' && preview && (
            <div>
              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Total Rows', value: preview.total_rows, color: '#a78bfa' },
                  { label: 'Clean', value: preview.clean_rows, color: '#22c55e' },
                  { label: 'Flagged', value: preview.anomaly_count, color: '#f59e0b' },
                  { label: 'Reviewed', value: `${decided}/${anomalies.length}`, color: '#3b82f6' },
                ].map(card => (
                  <div key={card.label} style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 10,
                    padding: '12px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: card.color }}>{card.value}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* Actions row */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <button onClick={handleAcceptAll} style={{
                  padding: '6px 14px', borderRadius: 8,
                  border: '1px solid rgba(34,197,94,0.3)',
                  background: 'rgba(34,197,94,0.08)',
                  color: '#22c55e', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}>
                  ✓ Accept All (smart)
                </button>

                {/* Type filter */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 'auto' }}>
                  {anomalyTypes.map(t => {
                    const cfg = t === 'ALL' ? { icon: '🔎', label: 'All', color: '#94a3b8' } : ANOMALY_CONFIG[t];
                    return (
                      <button key={t} onClick={() => setFilter(t)} style={{
                        padding: '4px 10px', borderRadius: 6,
                        border: `1px solid ${filter === t ? (cfg?.color || '#94a3b8') : 'rgba(255,255,255,0.08)'}`,
                        background: filter === t ? `${cfg?.color || '#94a3b8'}18` : 'transparent',
                        color: filter === t ? (cfg?.color || '#94a3b8') : '#475569',
                        cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      }}>
                        {t === 'ALL' ? '🔎 All' : `${cfg?.icon || ''} ${cfg?.label || t}`}
                        {t !== 'ALL' && (
                          <span style={{ marginLeft: 4, opacity: 0.6 }}>
                            ({anomalies.filter(a => a.anomaly_type === t).length})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Anomaly cards */}
              {filteredAnomalies.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#475569' }}>
                  No anomalies in this category.
                </div>
              )}
              {filteredAnomalies.map((anomaly, i) => (
                <AnomalyCard key={`${anomaly.row_index}-${anomaly.anomaly_type}-${i}`} anomaly={anomaly} onDecision={handleDecision} />
              ))}

              {error && (
                <div style={{
                  padding: '10px 14px', marginTop: 12,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 8, color: '#fca5a5', fontSize: 13,
                }}>
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Result ── */}
          {step === 'result' && commitResult && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
              <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: 20, fontWeight: 700 }}>Import Complete!</h3>

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                gap: 12, marginTop: 24, marginBottom: 24,
              }}>
                {[
                  { label: 'Imported', value: commitResult.imported, color: '#22c55e' },
                  { label: 'Skipped', value: commitResult.skipped, color: '#f59e0b' },
                  { label: 'Errors', value: commitResult.errors.length, color: '#ef4444' },
                ].map(card => (
                  <div key={card.label} style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 12, padding: '20px 12px',
                  }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: card.color }}>{card.value}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {commitResult.errors.length > 0 && (
                <div style={{
                  textAlign: 'left',
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 10, padding: '12px 16px',
                  marginBottom: 16,
                }}>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: '#f87171', fontWeight: 600 }}>
                    {commitResult.errors.length} row(s) had errors:
                  </p>
                  {commitResult.errors.map((err, i) => (
                    <p key={i} style={{ margin: '3px 0', fontSize: 11, color: '#fca5a5', fontFamily: 'monospace' }}>
                      {err}
                    </p>
                  ))}
                </div>
              )}

              <button
                onClick={() => { onImportComplete(); onClose(); }}
                style={{
                  width: '100%', padding: '14px',
                  borderRadius: 12, border: 'none',
                  background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                  color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 15,
                }}
              >
                View Group Expenses →
              </button>
            </div>
          )}
        </div>

        {/* Footer (review step only) */}
        {step === 'review' && (
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {decided}/{anomalies.length} reviewed · {accepted} accepted
              {!allDecided && anomalies.length > 0 && (
                <span style={{ color: '#f59e0b', marginLeft: 8 }}>
                  — Review all anomalies before committing
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('upload')} style={{
                padding: '10px 18px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13,
              }}>
                ← Back
              </button>
              <button
                onClick={handleCommit}
                disabled={loading || (!allDecided && anomalies.length > 0)}
                style={{
                  padding: '10px 22px', borderRadius: 10, border: 'none',
                  background: (allDecided || anomalies.length === 0)
                    ? 'linear-gradient(135deg, #7c3aed, #4f46e5)'
                    : 'rgba(255,255,255,0.05)',
                  color: (allDecided || anomalies.length === 0) ? '#fff' : '#374151',
                  cursor: (allDecided || anomalies.length === 0) ? 'pointer' : 'not-allowed',
                  fontWeight: 700, fontSize: 14, transition: 'all 0.2s',
                }}
              >
                {loading ? 'Importing…' : `Commit Import (${preview?.clean_rows || 0} + ${accepted} rows)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
