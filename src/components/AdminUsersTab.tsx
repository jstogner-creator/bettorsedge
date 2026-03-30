import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getDb } from '../firebase';
import { Users, Shield, ShieldAlert, Trash2, Edit2, Check, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { UserProfile } from '../types';

interface UserWithId extends UserProfile {
  id: string;
}

export function AdminUsersTab() {
  const [users, setUsers] = useState<UserWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<UserProfile>>({});

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const db = getDb();
      const snapshot = await getDocs(collection(db, 'users'));
      const usersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserWithId[];
      setUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleEdit = (user: UserWithId) => {
    setEditingUser(user.id);
    setEditForm({
      subscriptionStatus: user.subscriptionStatus,
      subscribedSports: user.subscribedSports || [],
    });
  };

  const handleSave = async (userId: string) => {
    try {
      const db = getDb();
      await updateDoc(doc(db, 'users', userId), {
        subscriptionStatus: editForm.subscriptionStatus,
        subscribedSports: editForm.subscribedSports,
      });
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  const handleDelete = async (userId: string) => {
    setUserToDelete(userId);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    try {
      const db = getDb();
      await deleteDoc(doc(db, 'users', userToDelete));
      setUserToDelete(null);
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const cancelDelete = () => {
    setUserToDelete(null);
  };

  const toggleSport = (sport: string) => {
    setEditForm(prev => {
      const sports = prev.subscribedSports || [];
      return {
        ...prev,
        subscribedSports: sports.includes(sport)
          ? sports.filter(s => s !== sport)
          : [...sports, sport]
      };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/20 rounded-xl">
            <Users className="w-6 h-6 text-indigo-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">User Database</h2>
        </div>
        <div className="text-sm text-slate-400">
          Total Users: {users.length}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="text-xs text-slate-500 uppercase bg-slate-800/50">
              <tr>
                <th className="px-6 py-4 font-medium">User Email</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Walkthrough</th>
                <th className="px-6 py-4 font-medium">Sports</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-slate-300">
                    {user.email || user.id}
                  </td>
                  <td className="px-6 py-4">
                    {editingUser === user.id ? (
                      <select
                        value={editForm.subscriptionStatus}
                        onChange={(e) => setEditForm({ ...editForm, subscriptionStatus: e.target.value as any })}
                        className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="canceled">Canceled</option>
                        <option value="past_due">Past Due</option>
                      </select>
                    ) : (
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium border",
                        user.subscriptionStatus === 'active' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                        user.subscriptionStatus === 'past_due' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                        "bg-slate-500/10 text-slate-400 border-slate-500/20"
                      )}>
                        {user.subscriptionStatus || 'inactive'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase border",
                        user.hasSeenWalkthrough 
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      )}>
                        {user.hasSeenWalkthrough ? "Seen" : "New"}
                      </span>
                      {user.hasSeenWalkthrough && (
                        <button
                          onClick={async () => {
                            try {
                              const db = getDb();
                              await updateDoc(doc(db, 'users', user.id), { hasSeenWalkthrough: false });
                              fetchUsers();
                            } catch (err) {
                              console.error("Error resetting walkthrough:", err);
                            }
                          }}
                          className="p-1 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors"
                          title="Reset Walkthrough"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {editingUser === user.id ? (
                      <div className="flex flex-wrap gap-2">
                        {['NBA', 'NFL', 'MLB', 'NHL', 'NCAA'].map(sport => (
                          <button
                            key={sport}
                            onClick={() => toggleSport(sport)}
                            className={cn(
                              "px-2 py-1 text-xs rounded-md border transition-colors",
                              editForm.subscribedSports?.includes(sport)
                                ? "bg-indigo-500/20 border-indigo-500 text-indigo-300"
                                : "bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600"
                            )}
                          >
                            {sport}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {user.subscribedSports?.length ? (
                          user.subscribedSports.map(sport => (
                            <span key={sport} className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-xs border border-slate-700">
                              {sport}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-600 text-xs italic">None</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {editingUser === user.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleSave(user.id)}
                          className="p-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg transition-colors"
                          title="Save"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingUser(null)}
                          className="p-1.5 bg-slate-700 text-slate-300 hover:bg-slate-600 rounded-lg transition-colors"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(user)}
                          className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                          title="Edit User"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="Delete User Data"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    No users found in the database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4 text-rose-500">
              <ShieldAlert className="w-6 h-6" />
              <h3 className="text-xl font-bold">Confirm Deletion</h3>
            </div>
            <p className="text-slate-300 mb-6">
              Are you sure you want to delete this user's data? This action cannot be undone and will permanently remove their profile from the database.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 rounded-xl font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-xl font-medium bg-rose-500 hover:bg-rose-600 text-white transition-colors"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
