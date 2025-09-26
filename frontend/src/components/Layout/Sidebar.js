import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { 
  FileText, 
  Settings, 
  Home,
  Activity,
  FolderOpen,
  User,
  LogOut,
  Menu,
  X,
  Heart,
  Stethoscope
} from 'lucide-react';
import companyLogo from '../../assets/logo.svg';

const Sidebar = ({ isCollapsed, setIsCollapsed }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home, roles: ['admin', 'doctor', 'researcher', 'observer'] },
    { name: 'Reports', href: '/reports', icon: FileText, roles: ['admin', 'doctor', 'researcher', 'observer'] },
    { name: 'Studies', href: '/studies', icon: FolderOpen, roles: ['doctor'] },
    { name: 'Admin Panel', href: '/admin', icon: Settings, roles: ['admin'] },
  ];

  const filteredNavigation = navigation.filter(item => 
    item.roles.includes(user?.role)
  );

  return (
    <>
      {/* Mobile menu overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 flex z-40 md:hidden">
          <div className="fixed inset-0 bg-primary-900 bg-opacity-75" onClick={() => setIsMobileOpen(false)} />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-gradient-to-b from-primary-50 to-medical-off-white">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-medical focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white bg-white shadow-soft"
                onClick={() => setIsMobileOpen(false)}
              >
                <X className="h-6 w-6 text-primary-600" />
              </button>
            </div>
            <MobileNavigationContent 
              user={user}
              filteredNavigation={filteredNavigation}
              showUserMenu={showUserMenu}
              setShowUserMenu={setShowUserMenu}
              navigate={navigate}
              logout={logout}
              setIsMobileOpen={setIsMobileOpen}
            />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className={`hidden md:flex ${isCollapsed ? 'md:w-16' : 'md:w-64'} md:flex-col md:fixed md:inset-y-0 transition-all duration-300`}>
        <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-b from-primary-50 to-medical-off-white border-r border-primary-200 shadow-medical">
          {/* Chickadee Medical Header */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-4 shadow-soft">
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : ''}`}>
              <div className="h-8 w-8 bg-white rounded-medical flex items-center justify-center shadow-soft border border-primary-200">
                <img 
                  src={companyLogo} 
                  alt="ChickadeeX" 
                  className="h-6 w-6 object-contain"
                />
              </div>
              {!isCollapsed && (
                <div className="ml-3">
                  <h1 className="text-white font-bold text-lg">ChickadeeX</h1>
                  <p className="text-primary-200 text-xs">Medical Imaging System</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col pt-4 pb-4 overflow-y-auto">

            <nav className="flex-1 px-3 space-y-2">
              {filteredNavigation.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={({ isActive }) =>
                    `${
                      isActive
                        ? 'nav-item-active'
                        : 'nav-item-inactive'
                    } nav-item ${isCollapsed ? 'justify-center' : ''}`
                  }
                  title={isCollapsed ? item.name : ''}
                >
                  <item.icon
                    className={`flex-shrink-0 h-5 w-5 ${isCollapsed ? '' : 'mr-3'}`}
                    aria-hidden="true"
                  />
                  {!isCollapsed && item.name}
                </NavLink>
              ))}
            </nav>
          </div>
          
          <div className="relative flex-shrink-0 border-t border-primary-200 bg-gradient-to-r from-chickadee-cream to-primary-100 p-4">
            <button
              type="button"
              onClick={() => setShowUserMenu(prev => !prev)}
              className={`w-full flex items-center focus:outline-none hover:bg-primary-100 rounded-medical p-2 transition-all duration-200 shadow-chickadee ${isCollapsed ? 'justify-center' : ''}`}
              title={isCollapsed ? user?.name : ''}
            >
              <div className="flex-shrink-0">
                <div className={`h-8 w-8 rounded-medical flex items-center justify-center shadow-chickadee ${
                  user?.role === 'admin' ? 'bg-error-600' : 
                  user?.role === 'doctor' ? 'bg-medical-teal' :
                  user?.role === 'researcher' ? 'bg-success-600' :
                  'bg-primary-600'
                }`}>
                  <span className="text-sm font-medium text-white">
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                </div>
              </div>
              {!isCollapsed && (
                <div className="ml-3 text-left">
                  <p className="text-sm font-medium text-primary-900">{user?.name}</p>
                  <p className="text-xs font-medium text-primary-600 capitalize">{user?.role}</p>
                </div>
              )}
            </button>

            {showUserMenu && (
              <div className={`absolute ${isCollapsed ? 'left-16' : 'left-4'} bottom-16 w-48 rounded-medical shadow-medical-lg py-2 bg-white border border-primary-200 z-50`}>
                <button
                  onClick={() => { setShowUserMenu(false); navigate('/profile'); }}
                  className="flex items-center px-4 py-2 text-sm text-primary-700 hover:bg-primary-50 w-full text-left rounded-medical mx-1 transition-colors duration-200"
                >
                  <User className="mr-3 h-4 w-4" />
                  Profile
                </button>
                <button
                  onClick={async () => { setShowUserMenu(false); await logout(); }}
                  className="flex items-center px-4 py-2 text-sm text-error-600 hover:bg-error-50 w-full text-left rounded-medical mx-1 transition-colors duration-200"
                >
                  <LogOut className="mr-3 h-4 w-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsMobileOpen(true)}
          className="bg-primary-600 p-2 rounded-medical text-chickadee-ivory hover:text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-200 shadow-chickadee transition-all duration-200"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>
    </>
  );
};

// Mobile navigation content component
const MobileNavigationContent = ({ user, filteredNavigation, showUserMenu, setShowUserMenu, navigate, logout, setIsMobileOpen }) => (
  <div className="flex-1 flex flex-col min-h-0">
    {/* Chickadee Medical Mobile Header */}
    <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-4 shadow-chickadee">
      <div className="flex items-center">
        <div className="h-8 w-8 bg-white rounded-medical flex items-center justify-center shadow-soft border border-primary-200">
          <img 
            src={companyLogo} 
            alt="ChickadeeX" 
            className="h-6 w-6 object-contain"
          />
        </div>
        <div className="ml-3">
          <h1 className="text-white font-bold text-lg">ChickadeeX</h1>
          <p className="text-primary-200 text-xs">Medical Imaging System</p>
        </div>
      </div>
    </div>
    
    <div className="flex-1 flex flex-col pt-4 pb-4 overflow-y-auto">
      <nav className="flex-1 px-3 space-y-2">
        {filteredNavigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            onClick={() => setIsMobileOpen(false)}
            className={({ isActive }) =>
              `${
                isActive
                  ? 'nav-item-active'
                  : 'nav-item-inactive'
              } nav-item`
            }
          >
            <item.icon
              className="mr-3 flex-shrink-0 h-5 w-5"
              aria-hidden="true"
            />
            {item.name}
          </NavLink>
        ))}
      </nav>
    </div>
    
    <div className="relative flex-shrink-0 border-t border-primary-200 bg-gradient-to-r from-chickadee-cream to-primary-100 p-4">
      <button
        type="button"
        onClick={() => setShowUserMenu(prev => !prev)}
        className="w-full flex items-center focus:outline-none hover:bg-primary-100 rounded-medical p-2 transition-all duration-200 shadow-chickadee"
      >
        <div className="flex-shrink-0">
          <div className={`h-8 w-8 rounded-medical flex items-center justify-center shadow-chickadee ${
            user?.role === 'admin' ? 'bg-error-600' : 
            user?.role === 'doctor' ? 'bg-medical-teal' :
            user?.role === 'researcher' ? 'bg-success-600' :
            'bg-primary-600'
          }`}>
            <span className="text-sm font-medium text-white">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </span>
          </div>
        </div>
        <div className="ml-3 text-left">
          <p className="text-sm font-medium text-primary-900">{user?.name}</p>
          <p className="text-xs font-medium text-primary-600 capitalize">{user?.role}</p>
        </div>
      </button>

      {showUserMenu && (
        <div className="absolute left-4 bottom-16 w-48 rounded-medical shadow-medical-lg py-2 bg-white border border-primary-200">
          <button
            onClick={() => { 
              setShowUserMenu(false); 
              setIsMobileOpen(false);
              navigate('/profile'); 
            }}
            className="flex items-center px-4 py-2 text-sm text-primary-700 hover:bg-primary-50 w-full text-left rounded-medical mx-1 transition-colors duration-200"
          >
            <User className="mr-3 h-4 w-4" />
            Profile
          </button>
          <button
            onClick={async () => { 
              setShowUserMenu(false); 
              setIsMobileOpen(false);
              await logout(); 
            }}
            className="flex items-center px-4 py-2 text-sm text-error-600 hover:bg-error-50 w-full text-left rounded-medical mx-1 transition-colors duration-200"
          >
            <LogOut className="mr-3 h-4 w-4" />
            Logout
          </button>
        </div>
      )}
    </div>
  </div>
);

export default Sidebar;
