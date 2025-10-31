import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePageContext } from '../contexts/PageContext';
import { 
  getUsers, 
  getLLMConfigs, 
  getSystemSettings, 
  updateSystemSettings,
  getPACSConfig,
  updatePACSConfig,
  createLLMConfig,
  updateLLMConfig,
  deleteLLMConfig,
  updateUser,
  setUserRole,
  clearUserPassword,
  deleteUser,
  testLLMConfig,
  getStatistics,
  getUserStats,
  listProviderModels
} from '../services/adminService';
import { 
  Users, 
  Settings, 
  Database, 
  Cpu, 
  Plus,
  Edit,
  Save,
  X,
  FileText,
  CheckCircle,
  Clock,
  Shield,
  ShieldCheck,
  UserCheck,
  UserX,
  Key,
  MoreHorizontal,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/UI/LoadingSpinner';

const AdminPage = ({ initialTab = 'users', standalone = false }) => {
  const { user: currentUser } = useAuth();
  const { setPageTitle, setPageDescription } = usePageContext();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [users, setUsers] = useState([]);
  const [llmConfigs, setLLMConfigs] = useState([]);
  const [systemSettings, setSystemSettings] = useState({ system_name: '', max_concurrent_tasks: 5, backup_frequency: 'daily' });
  const [pacsConfig, setPacsConfig] = useState({ pacs_url: '', auth_type: 'none', credentials: {}, connection_timeout: 30, query_timeout: 60 });
  const [editingPacs, setEditingPacs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [editingLLM, setEditingLLM] = useState(null);
  const [llmModal, setLlmModal] = useState({ open: false, mode: 'create', config: null });

  // Health status per LLM config
  const [llmHealth, setLlmHealth] = useState({});
  const [testLoading, setTestLoading] = useState({});

  const tabs = [
    { id: 'users', name: 'Users', icon: Users },
    { id: 'llm', name: 'LLM Config', icon: Cpu },
    { id: 'pacs', name: 'PACS Settings', icon: Database },
    { id: 'system', name: 'System Settings', icon: Settings }
  ];

  useEffect(() => {
    if (standalone) {
      setActiveTab(initialTab);
    }
  }, [initialTab, standalone]);

  useEffect(() => {
    if (!standalone) {
      setPageTitle('Admin Panel');
      setPageDescription('Manage users, models, and system settings.');
    }
    fetchData();
    getStatistics().then(setStats).catch(() => {});
    getLLMConfigs().then(setLLMConfigs).catch(() => {});
    getUsers().then(setUsers).catch(() => {});
    getUserStats().then(setUserStats).catch(() => {});
  }, [activeTab, setPageTitle, setPageDescription, standalone]);

  const fetchData = async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'users':
          const usersData = await getUsers();
          setUsers(usersData);
          break;
        case 'llm':
          const llmData = await getLLMConfigs();
          setLLMConfigs(llmData);
          break;
        case 'pacs':
          const pacs = await getPACSConfig();
          setPacsConfig(pacs || { pacs_url: '', auth_type: 'none', credentials: {}, connection_timeout: 30, query_timeout: 60 });
          setEditingPacs(null);
          break;
        case 'system':
          const settings = await getSystemSettings();
          if (settings) setSystemSettings(settings);
          break;
        default:
          break;
      }
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleRefresh = (event) => {
      const targetTab = event.detail?.tab;
      if (targetTab && targetTab !== activeTab) return;
      fetchData();
    };
    window.addEventListener('admin:refresh', handleRefresh);
    return () => window.removeEventListener('admin:refresh', handleRefresh);
  }, [activeTab]);


  const handleSaveSystemSettings = async () => {
    try {
      const updated = await updateSystemSettings(systemSettings);
      setSystemSettings(updated);
      toast.success('System settings updated');
    } catch (error) {
      toast.error('Failed to update system settings');
    }
  };

  const handleCreateLLM = async (payload) => {
    try {
      const result = await createLLMConfig(payload);
      
      // Show test result if available and update health status
      if (result.test_result) {
        // Update health status for newly created config
        setLlmHealth(prev => ({...prev, [result.id]: result.test_result}));
        
        if (result.test_result.healthy) {
          toast.success(`LLM configuration created and tested successfully! ✅ Latency: ${result.test_result.latency_ms}ms`);
        } else {
          toast.error('LLM configuration created, but auto-test failed. ❌ Please check the configuration.');
        }
      } else {
        toast.success('LLM configuration created');
      }
      
      setLlmModal({ open: false, mode: 'create', config: null });
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to create LLM configuration');
    }
  };

  const handleUpdateLLM = async (id, config) => {
    try {
      const updated = await updateLLMConfig(id, config);
      // Optimistically update UI immediately
      setLLMConfigs(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
      setEditingLLM(null);
      setLlmModal({ open: false, mode: 'create', config: null });
      toast.success('LLM configuration updated');
      // Optionally refresh in background to keep stats synced
      fetchData();
    } catch (error) {
      toast.error('Failed to update LLM configuration');
    }
  };

  const handleDeleteLLM = async (id) => {
    const target = llmConfigs.find(c => c.id === id);
    if (!window.confirm(`Delete LLM config "${target?.model_name || ''}"? This cannot be undone.`)) return;
    try {
      await deleteLLMConfig(id);
      // Remove from UI immediately
      setLLMConfigs(prev => prev.filter(c => c.id !== id));
      toast.success('LLM configuration deleted');
      // Optionally refresh in background
      fetchData();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to delete LLM configuration');
    }
  };

  const [editingUser, setEditingUser] = useState(null);
  const [passwordPopup, setPasswordPopup] = useState({ open: false, user: null });

  // Available non-admin roles
  const roles = ['doctor', 'researcher', 'observer'];

  const handleToggleActive = async (user) => {
    if (currentUser && user.id === currentUser.id) {
      toast.error('Cannot change your own status here');
      return;
    }
    try {
      await updateUser(user.id, { is_active: !user.is_active });
      toast.success(`User ${!user.is_active ? 'enabled' : 'disabled'}`);
      fetchData();
      // Trigger dashboard refresh
      window.dispatchEvent(new Event('dashboardRefresh'));
    } catch (e) {
      toast.error('Failed to update user status');
    }
  };

  const handleSetPassword = async (user, newPassword) => {
    if (currentUser && user.id === currentUser.id) {
      toast.error('Change your own password in Profile');
      return;
    }
    try {
      if (!newPassword || newPassword.length < 8) {
        toast.error('Password must be at least 8 characters');
        return;
      }
      await updateUser(user.id, { password: newPassword });
      toast.success('Password updated');
      setPasswordPopup({ open: false, user: null });
    } catch (e) {
      toast.error('Failed to update password');
    }
  };

  const handleClearPassword = async (user) => {
    if (currentUser && user.id === currentUser.id) {
      toast.error('Change your own password in Profile');
      return;
    }
    if (!window.confirm(`Are you sure you want to clear the local password for ${user.name}? They will only be able to login via SSO.`)) {
      return;
    }
    try {
      await clearUserPassword(user.id);
      toast.success('Local password removed');
    } catch (e) {
      toast.error('Failed to remove password');
    }
  };

  const handleSetRole = async (user, role) => {
    if (currentUser && user.id === currentUser.id) {
      toast.error('Cannot change your own role');
      return;
    }
    try {
      await setUserRole(user.id, role);
      toast.success('Role updated');
      fetchData();
      // Trigger dashboard refresh
      window.dispatchEvent(new Event('dashboardRefresh'));
    } catch (e) {
      toast.error('Failed to update role');
    }
  };

  const handleDeleteUser = async (user) => {
    if (currentUser && user.id === currentUser.id) {
      toast.error('Cannot delete your own account');
      return;
    }
    if (!window.confirm(`Delete user ${user.email}? This cannot be undone.`)) return;
    try {
      await deleteUser(user.id);
      toast.success('User deleted');
      fetchData();
      // Trigger dashboard refresh
      window.dispatchEvent(new Event('dashboardRefresh'));
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to delete user';
      toast.error(msg);
    }
  };

  const commitPacsConfig = async () => {
    try {
      const source = editingPacs || pacsConfig;
      const payload = {
        pacs_url: source.pacs_url || '',
        auth_type: source.auth_type || 'none',
        credentials: source.credentials || undefined,
        connection_timeout: typeof source.connection_timeout === 'number' ? source.connection_timeout : 30,
        query_timeout: typeof source.query_timeout === 'number' ? source.query_timeout : 60
      };
      await updatePACSConfig(payload);
      toast.success('PACS settings saved');
      const fresh = await getPACSConfig();
      setPacsConfig(fresh || payload);
      setEditingPacs(null);
    } catch (error) {
      const msg = error?.response?.data?.error || 'Failed to save PACS settings';
      toast.error(msg);
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'admin': return <Shield className="h-4 w-4 text-red-500" />;
      case 'doctor': return <UserCheck className="h-4 w-4 text-blue-500" />;
      case 'researcher': return <UserCheck className="h-4 w-4 text-purple-500" />;
      case 'observer': return <UserCheck className="h-4 w-4 text-gray-500" />;
      default: return <UserCheck className="h-4 w-4 text-gray-400" />;
    }
  };

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'admin': return 'bg-red-50 text-red-700 border-red-200';
      case 'doctor': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'researcher': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'observer': return 'bg-gray-50 text-gray-700 border-gray-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  // Password Reset Popup Component
  const PasswordResetPopup = ({ isOpen, user, onClose, onSave }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    if (!isOpen || !user) return null;

    const handleSubmit = (e) => {
      e.preventDefault();
      if (!password || password.length < 8) {
        toast.error('Password must be at least 8 characters');
        return;
      }
      if (password !== confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
      onSave(user, password);
      setPassword('');
      setConfirmPassword('');
    };

    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 rounded-t-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Reset Password</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mt-1">Set new password for {user.name}</p>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                <div className="relative">
                  <Key className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter new password"
                    required
                    minLength={8}
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                <div className="relative">
                  <Key className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Confirm new password"
                    required
                    minLength={8}
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              >
                Set Password
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderUsers = () => (
    <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">User Management</h3>
          <div className="text-sm text-gray-500">
            {users.length} user{users.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="overflow-x-auto">
        <div className="min-w-full divide-y divide-gray-200">
          {users.map((user, index) => (
            <div key={user.id} className={`px-6 py-4 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors duration-150`}>
              <div className="grid grid-cols-12 gap-4 items-center">
                
                {/* User Info - 3 columns */}
                <div className="col-span-3">
                  <div className="flex items-center space-x-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                      user.role === 'admin' ? 'bg-red-100 text-red-700' :
                      user.role === 'doctor' ? 'bg-blue-100 text-blue-700' :
                      user.role === 'researcher' ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                      <p className="text-sm text-gray-500 truncate">{user.email}</p>
                    </div>
                  </div>
                </div>

                {/* Role - 2 columns */}
                <div className="col-span-2">
                  {(user.role === 'admin' && currentUser?.id === user.id) ? (
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeClass(user.role)}`}>
                      {getRoleIcon(user.role)}
                      <span className="ml-1 capitalize">{user.role}</span>
                    </span>
                  ) : (
                    <select
                      className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium border focus:ring-2 focus:ring-blue-500 focus:border-transparent ${getRoleBadgeClass(user.role)}`}
                      value={user.role === 'admin' ? 'admin' : user.role}
                      onChange={(e) => handleSetRole(user, e.target.value)}
                    >
                      {user.role === 'admin' && <option value="admin" disabled>Admin</option>}
                      {roles.map(r => (
                        <option key={r} value={r} className="capitalize">{r}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Status - 2 columns */}
                <div className="col-span-2">
                  {(user.role === 'admin' && currentUser?.id === user.id) ? (
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {user.is_active ? <UserCheck className="h-3 w-3 mr-1" /> : <UserX className="h-3 w-3 mr-1" />}
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  ) : (
                    <button
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors hover:opacity-80 ${
                        user.is_active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'
                      }`}
                      onClick={() => handleToggleActive(user)}
                      title={user.is_active ? 'Click to disable' : 'Click to enable'}
                    >
                      {user.is_active ? <UserCheck className="h-3 w-3 mr-1" /> : <UserX className="h-3 w-3 mr-1" />}
                      {user.is_active ? 'Active' : 'Inactive'}
                    </button>
                  )}
                </div>

                {/* Dates - 2 columns */}
                <div className="col-span-2">
                  <div className="text-xs text-gray-500">
                    <div className="font-medium">Created</div>
                    <div>{format(new Date(user.created_at), 'MMM dd, yyyy')}</div>
                    <div className="mt-1 font-medium">Last Login</div>
                    <div>{user.last_login ? format(new Date(user.last_login), 'MMM dd, yyyy') : 'Never'}</div>
                  </div>
                </div>

                {/* Actions - 3 columns */}
                <div className="col-span-3">
                  {(currentUser?.id === user.id) ? (
                    <div className="flex items-center justify-center text-gray-400">
                      <span className="text-xs font-medium">Current User</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <button
                        className="flex items-center px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                        onClick={() => setPasswordPopup({ open: true, user })}
                      >
                        <Key className="h-3 w-3 mr-1" />
                        Set Password
                      </button>
                      <button
                        className="flex items-center px-2 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                        onClick={() => handleClearPassword(user)}
                      >
                        Clear
                      </button>
                      <button
                        className="flex items-center px-2 py-1.5 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
                        onClick={() => handleDeleteUser(user)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {users.length === 0 && (
        <div className="text-center py-12">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No users found</h3>
          <p className="mt-1 text-sm text-gray-500">Users will appear here once they log in via SSO.</p>
        </div>
      )}
      
      {/* Password Reset Popup */}
      <PasswordResetPopup
        isOpen={passwordPopup.open}
        user={passwordPopup.user}
        onClose={() => setPasswordPopup({ open: false, user: null })}
        onSave={handleSetPassword}
      />
    </div>
  );

  const renderLLMConfig = () => (
    <div className="space-y-6">
      {/* LLM Configs: Header + Rows in one container */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">LLM Configurations</h3>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span className="inline-flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Enabled: <strong>{llmConfigs.filter(c => c.enabled).length}</strong>
              </span>
              <span className="inline-flex items-center gap-1">
                <X className="h-4 w-4 text-gray-500" />
                Disabled: <strong>{llmConfigs.filter(c => !c.enabled).length}</strong>
              </span>
              <span>Total: <strong>{llmConfigs.length}</strong></span>
              <button
                onClick={() => setLlmModal({ open: true, mode: 'create', config: null })}
                className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create LLM
              </button>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <div className="min-w-full divide-y divide-gray-200">
            {llmConfigs.map((config) => (
              <div key={config.id} className="px-6 py-4 bg-white hover:bg-blue-50 transition-colors duration-150">
                <div className="grid grid-cols-12 gap-4 items-center">
                  {/* Name + Provider + optional URL */}
                  <div className="col-span-4">
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center">
                        <p className="text-sm font-semibold text-gray-900 truncate">{config.name || config.model_name}</p>
                        {llmHealth[config.id]?.healthy === true && (
                          <span className="ml-2 inline-flex items-center" title="Model is healthy">
                            <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                          </span>
                        )}
                        {llmHealth[config.id]?.healthy === false && (
                          <span className="ml-2 inline-flex items-center" title="Model test failed">
                            <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                          </span>
                        )}
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-700 border-gray-200">
                        {/openai\.com/i.test(config.api_url) ? 'GPT' : /generativelanguage\./i.test(config.api_url) ? 'Gemini' : /openrouter\.ai/i.test(config.api_url) ? 'Claude' : 'Other'}
                      </span>
                    </div>
                    {config.name && (
                      <div className="text-xs text-gray-500 truncate">Model: {config.model_name}</div>
                    )}
                    {!/openai\.com|generativelanguage\.|openrouter\.ai/i.test(config.api_url) && (
                      <div className="text-xs text-gray-500 truncate mt-1">{config.api_url}</div>
                    )}
                  </div>

                  {/* Priority */}
                  <div className="col-span-2">
                    <div className="text-xs text-gray-500">Priority</div>
                    <div className="text-sm text-gray-900">{config.priority}</div>
                  </div>

                  {/* Status switch */}
                  <div className="col-span-2">
                    <div className="text-xs text-gray-500 mb-1">Status</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const next = !config.enabled;
                          setLLMConfigs(prev => prev.map(c => c.id === config.id ? { ...c, enabled: next } : c));
                          try {
                            await updateLLMConfig(config.id, { enabled: next });
                          } catch (e) {
                            setLLMConfigs(prev => prev.map(c => c.id === config.id ? { ...c, enabled: !next } : c));
                            toast.error('Failed to toggle');
                          }
                        }}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${config.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                        aria-pressed={config.enabled}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${config.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                      <span className={`text-xs font-medium ${config.enabled ? 'text-green-700' : 'text-red-700'}`}>{config.enabled ? 'Enabled' : 'Disabled'}</span>
                    </div>
                  </div>

                  {/* Parameters */}
                <div className="col-span-2">
                  <div className="text-xs text-gray-500">Parameters</div>
                  <div className="text-xs text-gray-700 flex flex-col">
                    <span>Temp: {config.temperature ?? '-'}</span>
                    <span>Max tokens: {config.max_tokens ?? '-'}</span>
                    <span>Top-p: {config.top_p ?? '-'}</span>
                  </div>
                </div>

                  {/* Actions */}
                  <div className="col-span-2">
                    <div className="flex items-center space-x-2 justify-end">
                    <button
                      onClick={async () => {
                        setTestLoading(prev => ({ ...prev, [config.id]: true }));
                        try {
                          const res = await testLLMConfig(config.id);
                          setLlmHealth(prev => ({...prev, [config.id]: res}));
                          toast.success(`Model healthy! Latency: ${res.latency_ms}ms`);
                        } catch (e) {
                          setLlmHealth(prev => ({...prev, [config.id]: { healthy: false, error: e.message }}));
                          toast.error('Model test failed');
                        }
                        setTestLoading(prev => ({ ...prev, [config.id]: false }));
                      }}
                      className={`flex items-center px-3 py-1.5 text-xs rounded-md transition-colors ${
                        testLoading[config.id] 
                          ? 'bg-blue-100 text-blue-700 cursor-wait'
                          : llmHealth[config.id]?.healthy === true
                          ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                          : llmHealth[config.id]?.healthy === false
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {testLoading[config.id] ? (
                        <span className="inline-flex items-center">
                          <span className="w-3 h-3 mr-2 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
                          Testing...
                        </span>
                      ) : llmHealth[config.id]?.healthy === true ? (
                        <span className="inline-flex items-center">
                          <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Healthy ({llmHealth[config.id].latency_ms}ms)
                        </span>
                      ) : llmHealth[config.id]?.healthy === false ? (
                        <span className="inline-flex items-center">
                          <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                          Failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center">
                          <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Test
                        </span>
                      )}
                    </button>
                      <button
                        onClick={() => setLlmModal({ open: true, mode: 'edit', config })}
                        className="flex items-center px-2 py-1.5 text-xs bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 transition-colors"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteLLM(config.id)}
                        className="flex items-center px-2 py-1.5 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
                        title="Delete configuration"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {llmModal.open && (
        <LLMConfigModal
          mode={llmModal.mode}
          initial={llmModal.config}
          onClose={() => setLlmModal({ open: false, mode: 'create', config: null })}
          onCreate={(payload) => handleCreateLLM(payload)}
          onUpdate={(id, payload) => handleUpdateLLM(id, payload)}
        />
      )}
    </div>
  );

  const renderSystemFlags = () => (
    <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">System Configuration</h3>
        <p className="text-sm text-gray-600 mt-1">Configure global system settings and operational parameters</p>
      </div>
      
      <div className="p-6 space-y-6">
        {/* System Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">System Name</label>
          <div className="relative">
            <Settings className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={systemSettings.system_name || ''}
              onChange={(e) => setSystemSettings(prev => ({...prev, system_name: e.target.value}))}
              placeholder="e.g., Medical Reports System"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">Display name for this medical reporting system instance</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Max Concurrent Tasks */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Max Concurrent Tasks</label>
            <div className="relative">
              <Cpu className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="number"
                min={1}
                max={1000}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={systemSettings.max_concurrent_tasks ?? 5}
                onChange={(e) => setSystemSettings(prev => ({...prev, max_concurrent_tasks: parseInt(e.target.value)}))}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Maximum number of simultaneous AI report generation tasks</p>
          </div>

          {/* Backup Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Backup Frequency</label>
            <div className="relative">
              <Database className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={systemSettings.backup_frequency || ''}
                onChange={(e) => setSystemSettings(prev => ({...prev, backup_frequency: e.target.value}))}
                placeholder="e.g., daily, weekly, 0 2 * * *"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Schedule for automated database backups (supports cron expressions)</p>
          </div>
        </div>

        {/* Current Settings Summary */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Current Configuration Summary</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500">System Name:</span>
              <div className="font-medium text-gray-900">{systemSettings.system_name || 'Not set'}</div>
            </div>
            <div>
              <span className="text-gray-500">Task Limit:</span>
              <div className="font-medium text-gray-900">{systemSettings.max_concurrent_tasks ?? 5} concurrent</div>
            </div>
            <div>
              <span className="text-gray-500">Backup Schedule:</span>
              <div className="font-medium text-gray-900">{systemSettings.backup_frequency || 'Not configured'}</div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button 
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            onClick={handleSaveSystemSettings}
          >
            <Save className="h-4 w-4 mr-2" />
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );

  const renderPACSSettings = () => {
    const current = editingPacs || pacsConfig;
    const setField = (field, value) => {
      setEditingPacs(prev => ({ ...(prev || pacsConfig), [field]: value }));
    };
    const setCred = (field, value) => {
      const base = editingPacs || pacsConfig;
      setEditingPacs({ ...base, credentials: { ...(base.credentials || {}), [field]: value } });
    };

    const authType = current.auth_type || 'none';
    const creds = current.credentials || {};

    return (
      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">PACS Configuration</h3>
          <p className="text-sm text-gray-600 mt-1">Configure connection settings for DICOM Web services</p>
        </div>
        
        <div className="p-6 space-y-6">
          {/* PACS URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">PACS DICOMweb Base URL</label>
            <div className="relative">
              <Database className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="url"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://pacs.example.com/dicom-web/"
                value={current.pacs_url || ''}
                onChange={(e) => setField('pacs_url', e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Enter the base DICOMweb URL (no /studies). Backend automatically appends "/studies".</p>
          </div>

          {/* Auth Type and Timeouts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Authentication Type</label>
              <select 
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                value={authType} 
                onChange={(e) => setField('auth_type', e.target.value)}
              >
                <option value="none">No Authentication</option>
                <option value="basic">Basic Authentication</option>
                <option value="token">Bearer Token</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Connection Timeout</label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={300}
                  className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={current.connection_timeout ?? 30}
                  onChange={(e) => setField('connection_timeout', parseInt(e.target.value || '0'))}
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-400">sec</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Query Timeout</label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={600}
                  className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={current.query_timeout ?? 60}
                  onChange={(e) => setField('query_timeout', parseInt(e.target.value || '0'))}
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-400">sec</span>
              </div>
            </div>
          </div>

          {/* Authentication Credentials */}
          {authType === 'basic' && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h4 className="text-sm font-medium text-blue-900 mb-3">Basic Authentication Credentials</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-blue-700 mb-2">Username</label>
                  <input 
                    type="text"
                    className="w-full px-3 py-2 border border-blue-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" 
                    value={creds.username || ''} 
                    onChange={(e)=>setCred('username', e.target.value)}
                    placeholder="Enter username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-700 mb-2">Password</label>
                  <div className="relative">
                    <Key className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-400" />
                    <input 
                      type="password" 
                      className="w-full pl-10 pr-3 py-2 border border-blue-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" 
                      value={creds.password || ''} 
                      onChange={(e)=>setCred('password', e.target.value)}
                      placeholder="Enter password"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {authType === 'token' && (
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <h4 className="text-sm font-medium text-green-900 mb-3">Bearer Token Authentication</h4>
              <div className="relative">
                <Key className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-green-400" />
                <input 
                  type="password"
                  className="w-full pl-10 pr-3 py-2 border border-green-300 rounded-md shadow-sm focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white" 
                  value={creds.token || ''} 
                  onChange={(e)=>setCred('token', e.target.value)}
                  placeholder="Enter bearer token"
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button 
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              onClick={() => { setEditingPacs(null); toast.success('Reverted changes'); }}
            >
              Revert Changes
            </button>
            <button
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              onClick={commitPacsConfig}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    );
  };

  const tabContent = (
    <>
      {activeTab === 'users' && renderUsers()}
      {activeTab === 'llm' && renderLLMConfig()}
      {activeTab === 'pacs' && renderPACSSettings()}
      {activeTab === 'system' && renderSystemFlags()}
    </>
  );

  if (standalone) {
    if (loading) {
      return <LoadingSpinner />;
    }
    return (
      <div className="flex h-full flex-col space-y-4">
        {tabContent}
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="flex flex-col h-full space-y-6">

      {/* System Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Total Reports</div>
              <div className="text-2xl font-semibold text-gray-900">{stats?.total_reports ?? '—'}</div>
            </div>
            <FileText className="h-8 w-8 text-gray-400" />
          </div>
          <div className="mt-2 text-xs text-gray-600 flex gap-4">
            <span className="inline-flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              Finalized: <strong>{stats?.finalized_reports ?? 0}</strong>
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3 text-yellow-500" />
              Draft: <strong>{stats?.draft_reports ?? 0}</strong>
            </span>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">LLM Configs</div>
              <div className="text-2xl font-semibold text-gray-900">{llmConfigs.length || '—'}</div>
              <div className="mt-2 text-xs text-gray-600 flex items-center gap-4">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Enabled: <strong>{llmConfigs.filter(c => c.enabled).length}</strong>
                </span>
                <span className="inline-flex items-center gap-1">
                  <X className="h-3 w-3 text-gray-500" />
                  Disabled: <strong>{llmConfigs.filter(c => !c.enabled).length}</strong>
                </span>
              </div>
            </div>
            <Cpu className="h-8 w-8 text-indigo-500" />
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">PACS Status</div>
              <div className={`text-2xl font-semibold ${stats?.pacs_healthy ? 'text-green-600' : 'text-red-600'}`}>
                {stats?.pacs_healthy ? 'Healthy' : 'Unreachable'}
              </div>
            </div>
            {stats?.pacs_healthy ? 
              <CheckCircle className="h-8 w-8 text-green-500" /> : 
              <X className="h-8 w-8 text-red-500" />
            }
          </div>
          <div className="mt-2 text-xs text-gray-600">DICOMweb connectivity</div>
        </div>

        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Users</div>
              <div className="text-2xl font-semibold text-gray-900">{userStats?.totalUsers ?? (users.length || '—')}</div>
              <div className="mt-2 text-xs text-gray-600 flex items-center gap-4">
                <span className="inline-flex items-center gap-1">
                  <UserCheck className="h-3 w-3 text-green-500" />
                  Active: <strong>{userStats?.activeUsers ?? users.filter(u => u.is_active !== false).length}</strong>
                </span>
                <span className="inline-flex items-center gap-1">
                  <UserX className="h-3 w-3 text-gray-500" />
                  Inactive: <strong>{userStats?.inactiveUsers ?? users.filter(u => u.is_active === false).length}</strong>
                </span>
              </div>
            </div>
            <Users className="h-8 w-8 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex-shrink-0">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center`}
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {tabContent}
      </div>
    </div>
  );
};

const EditLLMForm = ({ config, onSave, onCancel }) => {
  const [editConfig, setEditConfig] = useState({
    model_name: config.model_name,
    api_url: config.api_url,
    priority: config.priority,
    enabled: config.enabled,
    api_key: '',
    temperature: config.temperature ?? 0.7,
    max_tokens: config.max_tokens ?? 2000,
    top_p: config.top_p ?? 1.0
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <input
          type="text"
          value={editConfig.model_name}
          onChange={(e) => setEditConfig(prev => ({...prev, model_name: e.target.value}))}
          className="form-input"
        />
        <input
          type="url"
          value={editConfig.api_url}
          onChange={(e) => setEditConfig(prev => ({...prev, api_url: e.target.value}))}
          className="form-input"
        />
        <input
          type="password"
          placeholder="API Key (leave blank to keep current)"
          onChange={(e) => setEditConfig(prev => ({...prev, api_key: e.target.value}))}
          className="form-input"
        />
        <input
          type="number"
          value={editConfig.priority}
          onChange={(e) => setEditConfig(prev => ({...prev, priority: parseInt(e.target.value)}))}
          className="form-input"
        />
        <div>
          <label className="block text-sm text-gray-700 mb-1">溫度 (Temperature)</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={editConfig.temperature}
            onChange={(e) => setEditConfig(prev => ({...prev, temperature: parseFloat(e.target.value)}))}
            className="form-input"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">最大長度 (Max Tokens)</label>
          <input
            type="number"
            min={256}
            max={4096}
            step={1}
            value={editConfig.max_tokens}
            onChange={(e) => setEditConfig(prev => ({...prev, max_tokens: parseInt(e.target.value)}))}
            className="form-input"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">top-p</label>
          <input
            type="number"
            min={0.1}
            max={1}
            step={0.1}
            value={editConfig.top_p}
            onChange={(e) => setEditConfig(prev => ({...prev, top_p: parseFloat(e.target.value)}))}
            className="form-input"
          />
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={editConfig.enabled}
            onChange={(e) => setEditConfig(prev => ({...prev, enabled: e.target.checked}))}
            className="rounded border-gray-300"
          />
          <span className="ml-2 text-sm text-gray-700">Enabled</span>
        </label>
        <div className="flex space-x-2">
          <button onClick={() => onSave(editConfig)} className="btn btn-success text-xs">
            <Save className="h-4 w-4 mr-1" />
            Save
          </button>
          <button onClick={onCancel} className="btn btn-secondary text-xs">
            <X className="h-4 w-4 mr-1" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// New modal for creating/editing LLM configs with provider presets
const LLMConfigModal = ({ mode = 'create', initial, onClose, onCreate, onUpdate }) => {
  const [provider, setProvider] = useState(() => {
    if (!initial) return 'gpt';
    const url = String(initial.api_url || '').toLowerCase();
    if (url.includes('generativelanguage.googleapis.com')) return 'gemini';
    if (url.includes('openrouter.ai')) return 'claude';
    if (url.includes('openai.com')) return 'gpt';
    return 'other';
  });

  const [form, setForm] = useState({
    name: initial?.name || '',
    model_name: initial?.model_name || '',
    priority: initial?.priority ?? 100,
    api_url: initial?.api_url || '',
    api_key: '',
    enabled: initial?.enabled ?? true,
    temperature: initial?.temperature ?? 0.7,
    max_tokens: initial?.max_tokens ?? 2000,
    top_p: initial?.top_p ?? 1.0,
    prompt: initial?.prompt || ''
  });

  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState('');
  const hasStoredKey = !!initial?.has_api_key;
  const [promptModalOpen, setPromptModalOpen] = useState(false);

  const presets = {
    gpt: {
      api_url: 'https://api.openai.com/v1/chat/completions',
      placeholderKey: 'sk-... (stored server-side)',
      modelHint: 'e.g., gpt-4o, gpt-4o-mini',
    },
    gemini: {
      api_url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      placeholderKey: 'AIza... (Google API Key)',
      modelHint: 'e.g., gemini-2.0-flash',
    },
    claude: {
      api_url: 'https://openrouter.ai/api/v1/chat/completions',
      placeholderKey: 'sk-or-... (OpenRouter key)',
      modelHint: 'e.g., anthropic/claude-3.5-sonnet (OpenRouter id)',
    },
    other: {
      api_url: '',
      placeholderKey: 'Authorization: Bearer <token> (key:value)',
      modelHint: 'Model identifier for your endpoint',
    },
  };

  const applyPreset = (prov) => {
    setProvider(prov);
    const p = presets[prov];
    setForm((f) => ({ ...f, api_url: p.api_url }));
    setModels([]);
    setModelError('');
  };

  const toHeaderApiKey = (input) => {
    if (!input) return '';
    const m = String(input).match(/^\s*([^:=>\s]+)\s*[:=]\s*(.+)$/);
    if (m) return `header:${m[1]}: ${m[2]}`;
    return input;
  };

  const handleSave = async () => {
    if (!form.model_name) { alert('Model is required'); return; }
    if (!form.priority || form.priority < 1) { alert('Priority must be >= 1'); return; }
    if (provider === 'other' && !form.api_url) { alert('API endpoint is required'); return; }

    const payload = {
      name: form.name || null,
      model_name: form.model_name,
      api_url: form.api_url || presets[provider]?.api_url || '',
      api_key: provider === 'other' ? toHeaderApiKey(form.api_key) : (form.api_key || ''),
      prompt: form.prompt || null,
      priority: parseInt(form.priority),
      enabled: !!form.enabled,
      temperature: parseFloat(form.temperature),
      max_tokens: parseInt(form.max_tokens),
      top_p: parseFloat(form.top_p),
    };

    try {
      if (mode === 'create') {
        await onCreate(payload);
      } else {
        const { api_key, ...rest } = payload;
        const editPayload = form.api_key ? payload : rest;
        await onUpdate(initial.id, editPayload);
      }
    } catch (_) {}
  };

  const p = presets[provider];

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 rounded-t-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{mode === 'create' ? 'Create LLM Configuration' : 'Edit LLM Configuration'}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">Choose a model provider and set parameters</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Provider and Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
              <select value={provider} onChange={(e)=>applyPreset(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <option value="gpt">GPT</option>
                <option value="gemini">Gemini</option>
                <option value="claude">Claude</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name (Custom)</label>
              <input type="text" value={form.name} onChange={(e)=>setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="e.g., Primary GPT, Fast Gemini" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* API Key */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
              <input type="password" value={form.api_key} onChange={(e)=>setForm({...form, api_key: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder={p.placeholderKey} />
              {provider === 'other' && (
                <div className="mt-2 text-xs bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-md p-2">
                  Use key:value format (e.g., Authorization: Bearer sk-...). JSON headers also supported via headers:{'{}'}.
                </div>
              )}
              {mode === 'edit' && hasStoredKey && (
                <div className="mt-2 text-xs bg-green-50 text-green-800 border border-green-200 rounded-md p-2">
                  <span className="font-medium">API key stored.</span> Leave blank to keep it.
                </div>
              )}
              {mode === 'edit' && !hasStoredKey && (
                <div className="mt-2 text-xs bg-red-50 text-red-700 border border-red-200 rounded-md p-2">
                  <span className="font-medium">No API key stored.</span> Enter one to enable provider calls.
                </div>
              )}
            </div>
            {provider === 'other' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">API Endpoint</label>
                <input type="url" value={form.api_url} onChange={(e)=>setForm({...form, api_url: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="https://your-endpoint" />
                <p className="text-xs text-gray-500 mt-1">Model list fetched from &lt;endpoint&gt;/models</p>
              </div>
            )}
          </div>

          <div className="w-full">
              <div className="flex items-end justify-between gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
                  {models.length > 0 ? (
                    <select
                      value={form.model_name}
                      onChange={(e)=>setForm({...form, model_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.id}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={form.model_name}
                      onChange={(e)=>setForm({...form, model_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  )}
                  {modelError && <p className="text-xs text-red-600 mt-1">{modelError}</p>}
                </div>
                <div className="flex-shrink-0 mb-0.5">
                  <button
                    type="button"
                    onClick={async () => {
                      setLoadingModels(true);
                      setModelError('');
                      setModels([]);
                      try {
                        const apiKey = form.api_key || (hasStoredKey ? 'USE_STORED_KEY' : '');
                        if (!apiKey) {
                          setModelError('API key is required. Please enter an API key or configure an LLM first.');
                          setLoadingModels(false);
                          return;
                        }
                        const r = await listProviderModels(provider, apiKey, provider === 'other' ? form.api_url : undefined);
                        const items = Array.isArray(r.models) ? r.models : [];
                        setModels(items);
                        if (!form.model_name && items.length) setForm({ ...form, model_name: items[0].id });
                      } catch (e) {
                        console.error('Load models error:', e);
                        const errorMsg = e.response?.data?.error || e.message || 'Failed to load models';
                        setModelError(`Failed to load models: ${errorMsg}`);
                      } finally {
                        setLoadingModels(false);
                      }
                    }}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  >
                    {loadingModels ? 'Loading…' : 'Load Models'}
                  </button>
                </div>
              </div>
            </div>

            {/* Prompt Template Modal */}
            <PromptTemplateModal
              open={promptModalOpen}
              value={form.prompt}
              onClose={() => setPromptModalOpen(false)}
              onSave={(v) => setForm({ ...form, prompt: v })}
            />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
              <input type="number" min={1} value={form.priority} onChange={(e)=>setForm({...form, priority: parseInt(e.target.value || '1')})} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <p className="text-xs text-gray-500 mt-1">Lower runs first</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Temperature</label>
              <input type="number" min={0} max={1} step={0.1} value={form.temperature} onChange={(e)=>setForm({...form, temperature: parseFloat(e.target.value)})} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <p className="text-xs text-gray-500 mt-1">Range 0–1</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Max Tokens</label>
              <input type="number" min={256} max={4096} step={1} value={form.max_tokens} onChange={(e)=>setForm({...form, max_tokens: parseInt(e.target.value || '256')})} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <p className="text-xs text-gray-500 mt-1">Range 256–4096</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Top-p</label>
              <input type="number" min={0.1} max={1} step={0.1} value={form.top_p} onChange={(e)=>setForm({...form, top_p: parseFloat(e.target.value)})} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <p className="text-xs text-gray-500 mt-1">Range 0.1–1.0</p>
            </div>
          </div>

          {/* Prompt Template opener */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setPromptModalOpen(true)}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100"
            >
              <FileText className="h-4 w-4 mr-2" />
              Edit Prompt Template
            </button>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700">Status</label>
            <button
              type="button"
              onClick={() => setForm({ ...form, enabled: !form.enabled })}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${form.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
              aria-pressed={form.enabled}
              aria-label="Toggle status"
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${form.enabled ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
            <span className={`text-sm font-medium ${form.enabled ? 'text-green-700' : 'text-red-700'}`}>
              {form.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
            <button onClick={handleSave} className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
              <Save className="h-4 w-4 mr-2" />
              {mode === 'create' ? 'Create' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const PromptTemplateModal = ({ open, value, onClose, onSave }) => {
  const [local, setLocal] = React.useState(value || '');
  React.useEffect(() => {
    if (open) setLocal(value || '');
  }, [open, value]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-gray-700 bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h4 className="text-md font-semibold text-gray-900">Edit Prompt Template</h4>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6">
          <textarea
            value={local}
            onChange={(e)=>setLocal(e.target.value)}
            className="w-full h-64 border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter your prompt template here..."
          />
          <p className="text-xs text-gray-500 mt-2">You can use placeholders like {'{{studyDescription}}'}, {'{{modality}}'}, {'{{clinicalContext}}'}.</p>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">Cancel</button>
          <button onClick={()=>{ try { onSave(local); toast.success('Prompt template saved'); onClose(); } catch(e) { toast.error('Failed to save prompt template'); } }} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">Save</button>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
