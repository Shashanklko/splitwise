import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, Loader2, ArrowLeft } from 'lucide-react';
import splitwiseLogo from '../assets/logo_splitwise.png';

const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(
        err.response?.data?.detail || 
        'Invalid email or password. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center px-4 py-12 relative">
      {/* Back Button */}
      <div className="absolute top-6 left-6">
        <Link 
          to="/" 
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-semibold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
      </div>

      <div className="w-full max-w-md mt-8">
        {/* Header Icon */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-white/90 p-3.5 rounded-3xl shadow-xl border border-slate-200/50 mb-4 animate-bounce">
            <img src={splitwiseLogo} alt="Splitwise Logo" className="w-12 h-12 object-contain" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Welcome Back</h1>
          <p className="text-slate-600 mt-2">Log in to track and split expenses with ease</p>
        </div>

        {/* Card */}
        <div className="glass-panel p-8 rounded-3xl shadow-2xl relative overflow-hidden">
          {error && (
            <div className="mb-6 bg-accent-600/10 border border-accent-500/20 text-accent-500 px-4 py-3 rounded-2xl text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-slate-700 text-sm font-semibold mb-2" htmlFor="email">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Mail className="w-5 h-5" />
                </span>
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input w-full pl-10 pr-4 py-3 rounded-2xl text-sm"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-slate-700 text-sm font-semibold" htmlFor="password">
                  Password
                </label>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Lock className="w-5 h-5" />
                </span>
                <input
                  id="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input w-full pl-10 pr-4 py-3 rounded-2xl text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-4 rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 hover:cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Logging in...
                </>
              ) : (
                'Log In'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="mt-8 pt-6 border-t border-slate-200/60 text-center">
            <span className="text-slate-600 text-sm">Don't have an account? </span>
            <Link to="/register" className="text-brand-500 hover:text-brand-600 font-bold text-sm transition-colors">
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
