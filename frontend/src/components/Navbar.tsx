import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut } from 'lucide-react';
import splitwiseLogo from '../assets/logo_splitwise.png';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="glass-panel sticky top-0 z-50 backdrop-blur-md border-b border-slate-200/50 px-6 py-4 flex items-center justify-between shadow-lg">
      <Link to="/" className="flex items-center gap-2 group">
        <img src={splitwiseLogo} alt="Splitwise Logo" className="w-8 h-8 object-contain" />
        <span className="font-extrabold text-2xl tracking-tight text-slate-800">
          Splitwise
        </span>
      </Link>

      {user && (
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 bg-slate-100/80 border border-slate-200/60 px-4 py-2 rounded-2xl">
            <div className="w-8 h-8 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-600 flex items-center justify-center font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-left leading-tight hidden md:block">
              <div className="font-semibold text-sm text-slate-800">{user.name}</div>
              <div className="text-xs text-slate-600">{user.email}</div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-100 hover:bg-accent-500/10 hover:text-accent-600 border border-slate-200 hover:border-accent-500/30 transition-all font-semibold text-sm text-slate-700"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
