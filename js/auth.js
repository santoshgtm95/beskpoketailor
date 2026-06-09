/**
 * auth.js – Authentication & Session Management
 * Beskpoke Tailor Shop
 */

const Auth = (() => {
  const SESSION_KEY = 'beskpoke_session';
  let _currentUser = null;

  function saveSession(user) {
    const safe = { UserID: user.UserID, Username: user.Username, Name: user.Name, Role: user.Role, Email: user.Email };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(safe));
    _currentUser = safe;
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) _currentUser = JSON.parse(raw);
    } catch { _currentUser = null; }
    return _currentUser;
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    _currentUser = null;
  }

  async function login(username, password) {
    const user = await DB.users.findByUsername(username);
    if (!user) throw new Error('Invalid username or password.');
    // Simple comparison (production would use bcrypt)
    if (user.PasswordHash !== password) throw new Error('Invalid username or password.');
    saveSession(user);
    await DB.auditlog.add({
      UserID: user.UserID,
      Action: 'Login',
      Timestamp: new Date().toISOString(),
      Details: `Admin logged in: ${user.Username}`,
    });
    return user;
  }

  async function logout() {
    if (_currentUser) {
      await DB.auditlog.add({
        UserID: _currentUser.UserID,
        Action: 'Logout',
        Timestamp: new Date().toISOString(),
        Details: `User logged out: ${_currentUser.Username}`,
      });
    }
    clearSession();
  }

  function currentUser() { return _currentUser; }
  function isLoggedIn()  { return !!_currentUser; }
  function isAdmin()     { return _currentUser?.Role === 'Admin'; }

  return { login, logout, currentUser, isLoggedIn, isAdmin, loadSession };
})();
