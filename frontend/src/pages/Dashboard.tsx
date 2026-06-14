import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import AddGroupModal from '../components/AddGroupModal';
import SettleUpModal from '../components/SettleUpModal';
import { 
  Users, 
  UserPlus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Plus, 
  Check, 
  Calendar,
  HelpCircle
} from 'lucide-react';


interface Friend {
  id: number;
  name: string;
  email: string;
  net_balance: string;
}

interface Group {
  id: number;
  name: string;
  creator_id: number;
  created_at: string;
}

interface Settlement {
  id: number;
  group_id: number | null;
  payer_id: number;
  payee_id: number;
  amount: string;
  created_at: string;
  payer_name: string;
  payee_name: string;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();

  
  // Modals state
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);

  // Data state
  const [groups, setGroups] = useState<Group[]>([]);
  const [netBalance, setNetBalance] = useState('0.00');
  const [groupBalances, setGroupBalances] = useState<Record<string, string>>({});
  const [friends, setFriends] = useState<Friend[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      // Fetch user groups
      const groupsRes = await api.get('/api/groups');
      setGroups(groupsRes.data);

      // Fetch user balances
      const balancesRes = await api.get('/api/users/me/balances');
      setNetBalance(balancesRes.data.net_balance);
      setGroupBalances(balancesRes.data.group_balances || {});
      setFriends(balancesRes.data.friends || []);

      // Fetch recent settlements
      const settlementsRes = await api.get('/api/settlements');
      setSettlements(settlementsRes.data);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const getBalanceColorClass = (bal: string) => {
    const val = parseFloat(bal);
    if (val > 0.005) return 'text-success-600';
    if (val < -0.005) return 'text-accent-600';
    return 'text-slate-500';
  };

  const getBalanceBgClass = (bal: string) => {
    const val = parseFloat(bal);
    if (val > 0.005) return 'bg-success-500/10 border-success-500/20';
    if (val < -0.005) return 'bg-accent-500/10 border-accent-500/20';
    return 'bg-slate-100/80 border-slate-200';
  };

  const formatCurrency = (amt: string | number) => {
    const val = typeof amt === 'string' ? parseFloat(amt) : amt;
    return `₹${Math.abs(val).toFixed(2)}`;
  };

  return (
    <div className="min-h-screen pb-12">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-brand-500 border-t-transparent animate-spin"></div>
            <p className="text-slate-600 text-sm">Loading dashboard details...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Quick summary & Groups list */}
            <div className="lg:col-span-2 space-y-8">
              
              {/* Overall Balance Summary Card */}
              <div className={`p-6 rounded-3xl border shadow-xl relative overflow-hidden transition-all ${getBalanceBgClass(netBalance)}`}>
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h2 className="text-slate-500 text-sm font-semibold tracking-wide uppercase">Your Net Balance</h2>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className={`text-4xl md:text-5xl font-black ${getBalanceColorClass(netBalance)}`}>
                        {parseFloat(netBalance) < 0 ? '-' : ''}{formatCurrency(netBalance)}
                      </span>
                    </div>
                    <p className="text-slate-600 text-xs mt-2 leading-relaxed">
                      {parseFloat(netBalance) > 0.005 
                        ? 'Awesome! You are owed money overall.' 
                        : parseFloat(netBalance) < -0.005 
                          ? 'Friendly reminder: time to settle up your debts!' 
                          : 'All settled up! No outstanding balances.'}
                    </p>
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => setIsSettleModalOpen(true)}
                      className="px-5 py-3 rounded-2xl bg-success-500 hover:bg-success-600 active:bg-success-700 text-white font-bold text-sm transition-all shadow-md shadow-success-500/20 hover:cursor-pointer flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      Settle Up
                    </button>
                    <button
                      onClick={() => setIsGroupModalOpen(true)}
                      className="px-5 py-3 rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-bold text-sm transition-all shadow-md shadow-brand-500/20 hover:cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4 stroke-[2.5]" />
                      Create Group
                    </button>
                  </div>
                </div>
              </div>

              {/* Groups Listing */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-500" />
                    My Groups
                  </h3>
                  <span className="text-xs text-slate-600 font-semibold uppercase bg-slate-100 border border-slate-200 px-3 py-1 rounded-full">
                    {groups.length} group{groups.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {groups.length === 0 ? (
                  <div className="glass-panel p-8 rounded-3xl border border-slate-200/50 text-center flex flex-col items-center justify-center gap-4 min-h-[200px]">
                    <div className="w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-500 flex items-center justify-center">
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-700">No Groups Yet</h4>
                      <p className="text-slate-600 text-sm mt-1 max-w-sm">Create a group to start adding and splitting shared expenses with your friends!</p>
                    </div>
                    <button
                      onClick={() => setIsGroupModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-md"
                    >
                      Add Group
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {groups.map((group) => {
                      const gBalance = groupBalances[group.id.toString()] || '0.00';
                      const val = parseFloat(gBalance);
                      
                      return (
                        <Link
                          key={group.id}
                          to={`/groups/${group.id}`}
                          className="glass-panel glass-panel-hover p-5 rounded-3xl text-left block border border-slate-200/50"
                        >
                          <div className="flex justify-between items-start gap-4 mb-4">
                            <div className="space-y-1 min-w-0">
                              <h4 className="font-bold text-slate-800 text-lg group-hover:text-brand-500 transition-colors line-clamp-1">
                                {group.name}
                              </h4>
                              <span className="text-[10px] text-slate-600 font-semibold flex items-center gap-1 shrink-0 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                              <Calendar className="w-3 h-3" />
                              {new Date(group.created_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                            </span>
                            </div>
                          </div>
                          
                          <div className="flex items-end justify-between">
                            <span className="text-slate-500 text-xs">Your balance</span>
                            <div className="text-right">
                              {val > 0.005 ? (
                                <div className="text-success-600 font-bold text-sm flex items-center justify-end">
                                  <ArrowUpRight className="w-4 h-4" />
                                  Owed {formatCurrency(gBalance)}
                                </div>
                              ) : val < -0.005 ? (
                                <div className="text-accent-600 font-bold text-sm flex items-center justify-end">
                                  <ArrowDownLeft className="w-4 h-4" />
                                  You owe {formatCurrency(gBalance)}
                                </div>
                              ) : (
                                <div className="text-slate-500 font-semibold text-sm">Settled Up</div>
                              )}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Friends & Settlements */}
            <div className="space-y-8">
              
              {/* Friends outstanding list */}
              <div>
                <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-emerald-500" />
                  Direct Balances
                </h3>
                
                <div className="glass-panel p-5 rounded-3xl border border-slate-200/50 space-y-4">
                  {friends.length === 0 ? (
                    <div className="text-center py-6">
                      <HelpCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                      <p className="text-slate-600 text-sm">No direct friend balances.</p>
                      <p className="text-slate-500 text-xs mt-1">Direct balances show up once you split non-group items.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                      {friends.map((friend) => {
                        const val = parseFloat(friend.net_balance);
                        return (
                          <div key={friend.id} className="flex justify-between items-center bg-slate-100/50 border border-slate-200/40 p-3 rounded-2xl">
                            <div>
                              <div className="font-bold text-slate-700 text-sm">{friend.name}</div>
                              <div className="text-slate-500 text-[10px]">{friend.email}</div>
                            </div>
                            <div className="text-right">
                              {val > 0.005 ? (
                                <div className="text-success-600 text-xs font-bold">
                                  owes you {formatCurrency(friend.net_balance)}
                                </div>
                              ) : (
                                <div className="text-accent-600 text-xs font-bold">
                                  you owe {formatCurrency(friend.net_balance)}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Settlement History Log */}
              <div>
                <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-500" />
                  Recent Settlements
                </h3>

                <div className="glass-panel p-5 rounded-3xl border border-slate-200/50 space-y-4">
                  {settlements.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-sm">
                      No recent settlements recorded.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                      {settlements.map((settle) => {
                        const isUserPayer = settle.payer_id === user?.id;
                        return (
                          <div key={settle.id} className="bg-slate-100/50 border border-slate-200/40 p-3 rounded-2xl text-xs space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-700">
                                {isUserPayer ? 'You paid' : `${settle.payer_name} paid`}
                              </span>
                              <span className="font-black text-success-600">
                                {formatCurrency(settle.amount)}
                              </span>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-500">
                              <span>Recipient: {settle.payee_id === user?.id ? 'You' : settle.payee_name}</span>
                              <span>
                                {new Date(settle.created_at).toLocaleDateString(undefined, {
                                  month: 'short', 
                                  day: 'numeric'
                                })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <AddGroupModal 
        isOpen={isGroupModalOpen} 
        onClose={() => setIsGroupModalOpen(false)} 
        onSuccess={fetchDashboardData} 
      />

      <SettleUpModal 
        isOpen={isSettleModalOpen} 
        onClose={() => setIsSettleModalOpen(false)} 
        onSuccess={fetchDashboardData} 
      />
    </div>
  );
};

export default Dashboard;
