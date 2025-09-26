import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { getProfile, updateProfile, updatePassword } from '../services/userService';
import LoadingSpinner from '../components/UI/LoadingSpinner';

const ProfilePage = () => {
  const { user, checkAuthStatus } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ name: '', email: '', has_local_password: false });
  const [pwd, setPwd] = useState({ current_password: '', new_password: '' });

  useEffect(() => {
    (async () => {
      try {
        const data = await getProfile();
        setProfile({ 
          name: data.name || user?.name || '', 
          email: data.email || user?.email || '',
          has_local_password: !!data.has_local_password
        });
      } catch (e) {
        console.error(e);
        toast.error('Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Profile fields are read-only by policy; only password can be changed

  const onChangePassword = async (e) => {
    e.preventDefault();
    try {
      await updatePassword(pwd);
      toast.success('Password updated');
      setPwd({ current_password: '', new_password: '' });
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update password');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Profile</h2>
          <form className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <label className="form-label">Name</label>
              <input
                className="form-input bg-gray-100"
                value={profile.name}
                readOnly
              />
            </div>
            <div className="sm:col-span-1">
              <label className="form-label">Email</label>
              <input className="form-input bg-gray-100" value={profile.email} readOnly />
            </div>
            <div className="sm:col-span-2 text-xs text-gray-500">Profile fields are read-only. You can change your password below.</div>
          </form>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Password</h2>
          <form className="grid grid-cols-1 gap-6 sm:grid-cols-2" onSubmit={onChangePassword}>
            {profile.has_local_password && (
              <div className="sm:col-span-1">
                <label className="form-label">Current Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={pwd.current_password}
                  onChange={(e) => setPwd({ ...pwd, current_password: e.target.value })}
                  autoComplete="current-password"
                />
              </div>
            )}
            <div className={profile.has_local_password ? 'sm:col-span-1' : 'sm:col-span-2'}>
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-input"
                value={pwd.new_password}
                onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })}
                autoComplete="new-password"
                required
                minLength={8}
              />
              {!profile.has_local_password && (
                <p className="text-xs text-gray-500 mt-1">Set a password for local login; Keycloak SSO remains available.</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-secondary">{profile.has_local_password ? 'Update Password' : 'Set Password'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
