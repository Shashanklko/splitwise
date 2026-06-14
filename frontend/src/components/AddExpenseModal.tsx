import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { X, Loader2, DollarSign, List, Percent, Share2 } from 'lucide-react';


interface Member {
  id: number;
  name: string;
  email: string;
}

interface PayerInput {
  user_id: number;
  amount_paid: string;
}

interface SplitInput {
  user_id: number;
  split_value: string;
  checked?: boolean; // For equal split selection
}

interface ExpensePayerResponse {
  user_id: number;
  amount_paid: string;
}

interface ExpenseSplitResponse {
  user_id: number;
  amount_owed: string;
  split_value: string | null;
}

interface ExpenseToEdit {
  id: number;
  description: string;
  amount: string;
  split_type: string;
  payers: ExpensePayerResponse[];
  splits: ExpenseSplitResponse[];
}

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  groupId: number;
  groupMembers: Member[];
  expenseToEdit?: ExpenseToEdit | null;
}

const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  groupId,
  groupMembers,
  expenseToEdit,
}) => {
  const { user } = useAuth();
  
  // General details
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [splitType, setSplitType] = useState('equally'); // equally, unequally, percentage, shares
  
  // Payers state
  const [showMultiPayers, setShowMultiPayers] = useState(false);
  const [payers, setPayers] = useState<PayerInput[]>([]);
  const [singlePayerId, setSinglePayerId] = useState<string>('');

  // Splits state
  const [splits, setSplits] = useState<SplitInput[]>([]);
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset/Initialize states when modal opens or edit data changes
  useEffect(() => {
    if (!isOpen) return;

    if (expenseToEdit) {
      // Edit mode pre-fills
      setDescription(expenseToEdit.description);
      setAmount(expenseToEdit.amount);
      setSplitType(expenseToEdit.split_type);

      // Setup payers
      if (expenseToEdit.payers.length > 1) {
        setShowMultiPayers(true);
        setPayers(
          groupMembers.map((m) => {
            const expPayer = expenseToEdit.payers.find((p) => p.user_id === m.id);
            return {
              user_id: m.id,
              amount_paid: expPayer ? parseFloat(expPayer.amount_paid).toFixed(2) : '0.00',
            };
          })
        );
      } else {
        setShowMultiPayers(false);
        const single = expenseToEdit.payers[0];
        setSinglePayerId(single ? single.user_id.toString() : user?.id.toString() || '');
      }

      // Setup splits
      setSplits(
        groupMembers.map((m) => {
          const expSplit = expenseToEdit.splits.find((s) => s.user_id === m.id);
          const hasOwed = expSplit && parseFloat(expSplit.amount_owed) > 0.005;
          return {
            user_id: m.id,
            split_value: expSplit && expSplit.split_value ? parseFloat(expSplit.split_value).toString() : '',
            checked: hasOwed || false,
          };
        })
      );
    } else {
      // Create mode resets
      setDescription('');
      setAmount('');
      setSplitType('equally');
      setShowMultiPayers(false);
      setSinglePayerId(user?.id.toString() || '');

      // Initialize multiple payers to 0.00
      setPayers(groupMembers.map((m) => ({ user_id: m.id, amount_paid: '0.00' })));

      // Initialize splits
      setSplits(groupMembers.map((m) => ({ user_id: m.id, split_value: '', checked: true })));
    }
  }, [isOpen, expenseToEdit, groupMembers]);

  if (!isOpen) return null;

  // Handle amount update to auto-fill single payer or proportional divides
  const handleAmountChange = (val: string) => {
    setAmount(val);
    setError('');
  };

  const handlePayerAmountChange = (userId: number, value: string) => {
    setPayers(
      payers.map((p) => (p.user_id === userId ? { ...p, amount_paid: value } : p))
    );
  };

  const handleSplitValueChange = (userId: number, value: string) => {
    setSplits(
      splits.map((s) => (s.user_id === userId ? { ...s, split_value: value } : s))
    );
  };

  const handleCheckboxChange = (userId: number, checked: boolean) => {
    setSplits(
      splits.map((s) => (s.user_id === userId ? { ...s, checked } : s))
    );
  };

  const validateInputs = (): boolean => {
    const totalAmount = parseFloat(amount);
    if (isNaN(totalAmount) || totalAmount <= 0) {
      setError('Please enter an expense amount greater than 0.');
      return false;
    }

    // 1. Payers Validation
    if (showMultiPayers) {
      const sumPaid = payers.reduce((sum, p) => sum + (parseFloat(p.amount_paid) || 0), 0);
      if (Math.abs(sumPaid - totalAmount) > 0.01) {
        setError(`Total amount paid (${sumPaid.toFixed(2)}) must equal total expense amount (${totalAmount.toFixed(2)})`);
        return false;
      }
    } else {
      if (!singlePayerId) {
        setError('Please select who paid for this expense.');
        return false;
      }
    }

    // 2. Splits Validation
    if (splitType === 'equally') {
      const checkedSplits = splits.filter((s) => s.checked);
      if (checkedSplits.length === 0) {
        setError('At least one member must be selected to split the bill.');
        return false;
      }
    } else if (splitType === 'unequally') {
      const sumOwed = splits.reduce((sum, s) => sum + (parseFloat(s.split_value) || 0), 0);
      if (Math.abs(sumOwed - totalAmount) > 0.01) {
        setError(`Sum of split amounts (${sumOwed.toFixed(2)}) must equal total expense amount (${totalAmount.toFixed(2)})`);
        return false;
      }
    } else if (splitType === 'percentage') {
      const sumPct = splits.reduce((sum, s) => sum + (parseFloat(s.split_value) || 0), 0);
      if (Math.abs(sumPct - 100) > 0.01) {
        setError(`Total percentages must sum up to exactly 100% (currently ${sumPct.toFixed(2)}%)`);
        return false;
      }
    } else if (splitType === 'shares') {
      const sumShares = splits.reduce((sum, s) => sum + (parseFloat(s.split_value) || 0), 0);
      if (sumShares <= 0) {
        setError('Total shares coefficient must be greater than zero.');
        return false;
      }
    }

    return true;
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInputs()) return;

    setSubmitting(true);
    setError('');

    const totalAmount = parseFloat(amount);
    let finalPayers = [];
    if (showMultiPayers) {
      finalPayers = payers
        .filter((p) => (parseFloat(p.amount_paid) || 0) > 0)
        .map((p) => ({
          user_id: p.user_id,
          amount_paid: parseFloat(p.amount_paid),
        }));
    } else {
      finalPayers = [
        {
          user_id: parseInt(singlePayerId),
          amount_paid: totalAmount,
        },
      ];
    }

    let finalSplits = [];
    if (splitType === 'equally') {
      finalSplits = splits
        .filter((s) => s.checked)
        .map((s) => ({
          user_id: s.user_id,
          split_value: null,
        }));
    } else {
      finalSplits = splits
        .filter((s) => (parseFloat(s.split_value) || 0) > 0)
        .map((s) => ({
          user_id: s.user_id,
          split_value: parseFloat(s.split_value),
        }));
    }

    const payload = {
      group_id: groupId,
      description,
      amount: totalAmount,
      split_type: splitType,
      payers: finalPayers,
      splits: finalSplits,
    };

    try {
      if (expenseToEdit) {
        await api.put(`/api/expenses/${expenseToEdit.id}`, payload);
      } else {
        await api.post('/api/expenses', payload);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'An error occurred while saving the expense.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="glass-panel w-full max-w-xl rounded-3xl p-6 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/10 text-brand-600 p-2.5 rounded-2xl border border-brand-500/20">
              <DollarSign className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">
              {expenseToEdit ? 'Edit Shared Expense' : 'Add Shared Expense'}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-750 p-1.5 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-accent-600/10 border border-accent-500/20 text-accent-500 px-4 py-3 rounded-2xl text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Description & Amount */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 text-sm font-semibold mb-2" htmlFor="desc">
                Description
              </label>
              <input
                id="desc"
                type="text"
                required
                placeholder="e.g. Dinner, Groceries, Electricity"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="glass-input w-full px-4 py-3 rounded-2xl text-sm"
              />
            </div>
            <div>
              <label className="block text-slate-700 text-sm font-semibold mb-2" htmlFor="exp_amount">
                Total Amount (₹)
              </label>
              <input
                id="exp_amount"
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="glass-input w-full px-4 py-3 rounded-2xl text-sm font-bold text-brand-600"
              />
            </div>
          </div>

          {/* Payers Selection */}
          <div className="border-t border-slate-200/55 pt-4">
            <div className="flex justify-between items-center mb-3">
              <label className="text-slate-700 text-sm font-semibold">Who Paid?</label>
              <button
                type="button"
                onClick={() => setShowMultiPayers(!showMultiPayers)}
                className="text-xs text-brand-500 hover:text-brand-600 font-bold transition-colors"
              >
                {showMultiPayers ? 'Switch to Single Payer' : 'Split Among Multiple Payers'}
              </button>
            </div>

            {!showMultiPayers ? (
              <select
                value={singlePayerId}
                onChange={(e) => setSinglePayerId(e.target.value)}
                className="glass-input w-full px-4 py-3 rounded-2xl text-sm"
              >
                <option value="">Select Payer</option>
                {groupMembers.map((m) => (
                  <option key={m.id} value={m.id.toString()}>
                    {m.name} {m.id === user?.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-3 bg-slate-100/50 border border-slate-200/40 p-4 rounded-2xl max-h-48 overflow-y-auto">
                <span className="text-[10px] text-slate-500 block mb-2">
                  Enter individual amounts paid by each member (Must sum up to Total Amount):
                </span>
                {groupMembers.map((m) => {
                  const val = payers.find((p) => p.user_id === m.id)?.amount_paid || '';
                  return (
                    <div key={m.id} className="flex justify-between items-center gap-4">
                      <span className="text-slate-700 text-xs truncate max-w-xs">{m.name}</span>
                      <div className="relative w-32 shrink-0">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-slate-500">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={val}
                          onChange={(e) => handlePayerAmountChange(m.id, e.target.value)}
                          className="glass-input w-full pl-6 pr-3 py-1.5 rounded-xl text-xs text-right"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Split Type Selector */}
          <div className="border-t border-slate-200/55 pt-4">
            <label className="block text-slate-700 text-sm font-semibold mb-3">Split Method</label>
            <div className="grid grid-cols-4 gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
              {[
                { id: 'equally', label: 'Equally', icon: List },
                { id: 'unequally', label: 'Unequally', icon: DollarSign },
                { id: 'percentage', label: 'By %', icon: Percent },
                { id: 'shares', label: 'Shares', icon: Share2 },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSplitType(item.id)}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition-all hover:cursor-pointer ${
                      splitType === item.id 
                        ? 'bg-brand-500 text-white shadow-md' 
                        : 'text-slate-500 hover:text-slate-750 hover:bg-slate-250/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Split Allocations list */}
          <div className="bg-slate-100/50 border border-slate-200/40 p-4 rounded-2xl space-y-3">
            <h4 className="text-slate-700 text-xs font-bold mb-2">Split Details</h4>

            {splitType === 'equally' && (
              <div className="space-y-3 max-h-48 overflow-y-auto">
                <span className="text-[10px] text-slate-500 block mb-2">
                  Check members to include in equal split:
                </span>
                {groupMembers.map((m) => {
                  const splitObj = splits.find((s) => s.user_id === m.id);
                  const isChecked = splitObj?.checked ?? true;
                  return (
                    <label key={m.id} className="flex items-center justify-between gap-4 p-2 hover:bg-slate-200/50 rounded-xl transition-colors cursor-pointer select-none">
                      <span className="text-slate-700 text-xs">{m.name}</span>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => handleCheckboxChange(m.id, e.target.checked)}
                        className="w-4 h-4 rounded text-brand-500 border-slate-300 accent-brand-500"
                      />
                    </label>
                  );
                })}
              </div>
            )}

            {splitType === 'unequally' && (
              <div className="space-y-3 max-h-48 overflow-y-auto">
                <span className="text-[10px] text-slate-500 block mb-2">
                  Enter exact amounts for each member (Must sum up to Total Amount):
                </span>
                {groupMembers.map((m) => {
                  const val = splits.find((s) => s.user_id === m.id)?.split_value || '';
                  return (
                    <div key={m.id} className="flex justify-between items-center gap-4">
                      <span className="text-slate-700 text-xs truncate max-w-xs">{m.name}</span>
                      <div className="relative w-32 shrink-0">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-slate-500">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={val}
                          onChange={(e) => handleSplitValueChange(m.id, e.target.value)}
                          className="glass-input w-full pl-6 pr-3 py-1.5 rounded-xl text-xs text-right"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {splitType === 'percentage' && (
              <div className="space-y-3 max-h-48 overflow-y-auto">
                <span className="text-[10px] text-slate-500 block mb-2">
                  Enter percentages for each member (Must sum up to exactly 100%):
                </span>
                {groupMembers.map((m) => {
                  const val = splits.find((s) => s.user_id === m.id)?.split_value || '';
                  return (
                    <div key={m.id} className="flex justify-between items-center gap-4">
                      <span className="text-slate-700 text-xs truncate max-w-xs">{m.name}</span>
                      <div className="relative w-28 shrink-0">
                        <input
                          type="number"
                          step="0.1"
                          placeholder="0"
                          value={val}
                          onChange={(e) => handleSplitValueChange(m.id, e.target.value)}
                          className="glass-input w-full pr-7 pl-3 py-1.5 rounded-xl text-xs text-right"
                        />
                        <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-500">%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {splitType === 'shares' && (
              <div className="space-y-3 max-h-48 overflow-y-auto">
                <span className="text-[10px] text-slate-500 block mb-2">
                  Enter proportional share coefficients (e.g. 1 share, 2 shares):
                </span>
                {groupMembers.map((m) => {
                  const val = splits.find((s) => s.user_id === m.id)?.split_value || '';
                  return (
                    <div key={m.id} className="flex justify-between items-center gap-4">
                      <span className="text-slate-700 text-xs truncate max-w-xs">{m.name}</span>
                      <div className="w-24 shrink-0">
                        <input
                          type="number"
                          step="1"
                          placeholder="0"
                          value={val}
                          onChange={(e) => handleSplitValueChange(m.id, e.target.value)}
                          className="glass-input w-full px-3 py-1.5 rounded-xl text-xs text-right"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm border border-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !description || !amount}
              className="flex-1 py-3 px-4 rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 hover:cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                expenseToEdit ? 'Save Changes' : 'Add Expense'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddExpenseModal;
