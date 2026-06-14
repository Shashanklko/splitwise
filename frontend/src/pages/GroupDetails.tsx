import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import AddMemberModal from '../components/AddMemberModal';
import AddExpenseModal from '../components/AddExpenseModal';
import ExpenseDetailsModal from '../components/ExpenseDetailsModal';
import SettleUpModal from '../components/SettleUpModal';
import { 
  ArrowLeft, 
  UserPlus, 
  Trash2, 
  Edit3, 
  Plus, 
  Check, 
  HelpCircle,
  Crown
} from 'lucide-react';


interface Member {
  id: number;
  name: string;
  email: string;
}

interface Group {
  id: number;
  name: string;
  creator_id: number;
  created_at: string;
  members: Member[];
}

interface PayerResponse {
  user_id: number;
  amount_paid: string;
  user_name: string;
}

interface SplitResponse {
  user_id: number;
  amount_owed: string;
  split_value: string | null;
  user_name: string;
}

interface Expense {
  id: number;
  group_id: number | null;
  description: string;
  amount: string;
  split_type: string;
  created_at: string;
  payers: PayerResponse[];
  splits: SplitResponse[];
}

interface SimplifiedDebt {
  debtor_id: number;
  debtor_name: string;
  creditor_id: number;
  creditor_name: string;
  amount: string;
}

interface UserBalance {
  user_id: number;
  name: string;
  net_balance: string;
}

const GroupDetails: React.FC = () => {
  const { group_id } = useParams<{ group_id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const numericGroupId = parseInt(group_id || '0');

  // Modal open states
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);

  // Focus targets
  const [selectedExpenseId, setSelectedExpenseId] = useState<number | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<any | null>(null);

  // Group data
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<UserBalance[]>([]);
  const [simplifiedDebts, setSimplifiedDebts] = useState<SimplifiedDebt[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroupDetails = async () => {
    try {
      // Fetch group general info
      const groupRes = await api.get(`/api/groups/${numericGroupId}`);
      setGroup(groupRes.data);

      // Fetch group balances & simplified debts
      const balancesRes = await api.get(`/api/groups/${numericGroupId}/balances`);
      setBalances(balancesRes.data.balances || []);
      setSimplifiedDebts(balancesRes.data.simplified_debts || []);

      // Fetch group expenses
      const expensesRes = await api.get(`/api/expenses?group_id=${numericGroupId}`);
      setExpenses(expensesRes.data);
    } catch (err: any) {
      console.error('Failed to load group details:', err);
      // Redirect to dashboard if group not found or unauthorized
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (numericGroupId) {
      fetchGroupDetails();
    }
  }, [numericGroupId]);

  const handleRemoveMember = async (memberId: number) => {
    if (!group) return;
    if (!window.confirm('Are you sure you want to remove this member from the group?')) return;

    try {
      await api.delete(`/api/groups/${group.id}/members/${memberId}`);
      fetchGroupDetails();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to remove member.');
    }
  };

  const handleDeleteExpense = async (e: React.MouseEvent, expenseId: number) => {
    e.stopPropagation(); // Avoid opening detail modal
    if (!window.confirm('Are you sure you want to delete this expense?')) return;

    try {
      await api.delete(`/api/expenses/${expenseId}`);
      fetchGroupDetails();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete expense.');
    }
  };

  const handleEditExpenseClick = (e: React.MouseEvent, exp: Expense) => {
    e.stopPropagation(); // Avoid opening detail modal
    setExpenseToEdit(exp);
    setIsExpenseModalOpen(true);
  };

  const handleExpenseClick = (expenseId: number) => {
    setSelectedExpenseId(expenseId);
    setIsDetailsModalOpen(true);
  };

  const getBalanceColorClass = (bal: string) => {
    const val = parseFloat(bal);
    if (val > 0.005) return 'text-success-600';
    if (val < -0.005) return 'text-accent-600';
    return 'text-slate-500';
  };

  const formatCurrency = (amt: string | number) => {
    const val = typeof amt === 'string' ? parseFloat(amt) : amt;
    return `₹${Math.abs(val).toFixed(2)}`;
  };

  return (
    <div className="min-h-screen pb-12">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* Back Link */}
        <Link to="/" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-semibold transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        {loading || !group ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-brand-500 border-t-transparent animate-spin"></div>
            <p className="text-slate-600 text-sm">Loading group details...</p>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Header Area */}
            <div className="glass-panel p-6 rounded-3xl border border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">
                  {group.name}
                </h1>
                <p className="text-slate-500 text-xs mt-1 leading-relaxed flex items-center gap-1">
                  Created by 
                  <span className="font-semibold text-slate-750">{group.members.find(m => m.id === group.creator_id)?.name || 'Admin'}</span>
                  {group.creator_id === user?.id && <Crown className="w-3.5 h-3.5 text-amber-500 fill-amber-500 inline" />}
                  on {new Date(group.created_at).toLocaleDateString(undefined, {month: 'long', year: 'numeric'})}
                </p>
              </div>

              <div className="flex gap-3 shrink-0">
                <button
                  onClick={() => setIsSettleModalOpen(true)}
                  className="px-4 py-2.5 rounded-2xl bg-success-500 hover:bg-success-600 active:bg-success-700 text-white font-bold text-xs transition-all shadow-md shadow-success-500/20 hover:cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  Settle Up
                </button>
                <button
                  onClick={() => {
                    setExpenseToEdit(null);
                    setIsExpenseModalOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-bold text-xs transition-all shadow-md shadow-brand-500/20 hover:cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  Add Expense
                </button>
              </div>
            </div>

            {/* Split layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left & Middle: Expenses ledger */}
              <div className="lg:col-span-2 space-y-6">
                
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    Expenses Ledger
                  </h2>
                  <span className="text-xs text-slate-600 font-semibold bg-slate-100 border border-slate-200 px-3 py-1 rounded-full">
                    {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {expenses.length === 0 ? (
                  <div className="glass-panel p-10 rounded-3xl border border-slate-200/50 text-center flex flex-col items-center justify-center gap-4 min-h-[300px]">
                    <div className="w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-500 flex items-center justify-center">
                      <HelpCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-700 text-lg">No Expenses Logged</h4>
                      <p className="text-slate-600 text-sm mt-1 max-w-sm">Expenses logged in this group will appear here. Click Add Expense to start splitting!</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {expenses.map((exp) => {
                      const displayPayers = exp.payers.map((p) => p.user_name).join(', ');
                      
                      return (
                        <div
                          key={exp.id}
                          onClick={() => handleExpenseClick(exp.id)}
                          className="glass-panel glass-panel-hover p-4 rounded-3xl border border-slate-200/50 cursor-pointer flex justify-between items-center gap-4"
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            {/* Date block */}
                            <div className="w-12 h-12 bg-slate-100 border border-slate-200 rounded-2xl flex flex-col items-center justify-center text-[10px] uppercase font-bold text-slate-500 shrink-0">
                              <span className="text-slate-700 font-semibold">
                                {new Date(exp.created_at).toLocaleDateString(undefined, {day: '2-digit'})}
                              </span>
                              <span>
                                {new Date(exp.created_at).toLocaleDateString(undefined, {month: 'short'})}
                              </span>
                            </div>

                            {/* Expense Details */}
                            <div className="min-w-0">
                              <h4 className="font-bold text-slate-800 text-sm md:text-base truncate">
                                {exp.description}
                              </h4>
                              <div className="text-[10px] text-slate-500 mt-0.5 leading-relaxed truncate">
                                Paid by <span className="font-semibold text-slate-700">{displayPayers}</span>
                              </div>
                            </div>
                          </div>

                          {/* Price & Actions */}
                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right">
                              <div className="font-black text-slate-800 text-sm md:text-base">
                                {formatCurrency(exp.amount)}
                              </div>
                              <div className="text-[9px] text-slate-500 font-semibold uppercase mt-0.5">
                                {exp.split_type}
                              </div>
                            </div>

                            {/* Edit & Delete Action Panel */}
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={(e) => handleEditExpenseClick(e, exp)}
                                className="p-2 rounded-xl text-slate-500 hover:text-brand-650 hover:bg-brand-50 border border-transparent hover:border-brand-500/20 transition-all"
                                title="Edit Expense"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => handleDeleteExpense(e, exp.id)}
                                className="p-2 rounded-xl text-slate-500 hover:text-accent-600 hover:bg-accent-50 border border-transparent hover:border-accent-500/20 transition-all"
                                title="Delete Expense"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Side Column: Balances, Invite, Simplified Debts */}
              <div className="space-y-8">
                
                {/* Simplified Debts List */}
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                    Who Owes Whom
                  </h3>
                  <div className="glass-panel p-5 rounded-3xl border border-slate-200/50 space-y-4">
                    {simplifiedDebts.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-xs leading-relaxed">
                        Everyone is settled up! There are no active simplified debts in this group.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {simplifiedDebts.map((debt, index) => (
                          <div key={index} className="flex justify-between items-center text-xs bg-slate-100/50 border border-slate-200/40 p-3 rounded-2xl">
                            <div className="leading-relaxed">
                              <span className="font-bold text-slate-700">{debt.debtor_name}</span>
                              <span className="text-slate-500 mx-1">owes</span>
                              <span className="font-bold text-slate-700">{debt.creditor_name}</span>
                            </div>
                            <span className="font-black text-success-600">{formatCurrency(debt.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Group Members List */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      Group Members
                    </h3>
                    <button
                      onClick={() => setIsMemberModalOpen(true)}
                      className="p-1 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-650 hover:bg-brand-500/20 transition-all"
                      title="Invite Member"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="glass-panel p-5 rounded-3xl border border-slate-200/50 space-y-3">
                    {balances.map((mb) => {
                      const isCreator = mb.user_id === group.creator_id;
                      const isCurrentUser = mb.user_id === user?.id;
                      const val = parseFloat(mb.net_balance);
                      
                      return (
                        <div key={mb.user_id} className="flex justify-between items-center bg-slate-100/50 border border-slate-200/40 p-3 rounded-2xl text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-slate-700 truncate max-w-[120px]">
                              {mb.name} {isCurrentUser ? '(You)' : ''}
                            </span>
                            {isCreator && (
                              <span title="Admin/Creator">
                                <Crown className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                              </span>
                            )}

                          </div>
                          
                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`font-bold ${getBalanceColorClass(mb.net_balance)}`}>
                              {val > 0.005 ? '+' : ''}{formatCurrency(mb.net_balance)}
                            </span>
                            
                            {/* Remove Member Button (Visible only to Group Creator, and creator cannot remove themselves) */}
                            {group.creator_id === user?.id && mb.user_id !== group.creator_id && (
                              <button
                                onClick={() => handleRemoveMember(mb.user_id)}
                                className="p-1 text-slate-400 hover:text-accent-500 hover:bg-accent-500/10 rounded-lg transition-colors"
                                title="Remove Member"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

          </div>
        )}
      </main>

      {/* Modals */}
      <AddMemberModal 
        isOpen={isMemberModalOpen} 
        onClose={() => setIsMemberModalOpen(false)} 
        onSuccess={fetchGroupDetails} 
        groupId={numericGroupId} 
      />

      <AddExpenseModal 
        isOpen={isExpenseModalOpen} 
        onClose={() => {
          setIsExpenseModalOpen(false);
          setExpenseToEdit(null);
        }} 
        onSuccess={fetchGroupDetails} 
        groupId={numericGroupId} 
        groupMembers={group?.members || []} 
        expenseToEdit={expenseToEdit} 
      />

      <ExpenseDetailsModal 
        isOpen={isDetailsModalOpen} 
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedExpenseId(null);
        }} 
        expenseId={selectedExpenseId} 
      />

      <SettleUpModal 
        isOpen={isSettleModalOpen} 
        onClose={() => setIsSettleModalOpen(false)} 
        onSuccess={fetchGroupDetails} 
        prefilledGroupId={numericGroupId} 
        prefilledMembers={group?.members || []} 
      />
    </div>
  );
};

export default GroupDetails;
