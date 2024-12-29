import { db } from './config.js';
import { 
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc,
    orderBy, onSnapshot, serverTimestamp, limit 
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

class UsersManager {
    constructor() {
        this.usersRef = collection(db, 'users');
        this.readingStatesRef = collection(db, 'reading_states');
        this.filters = {
            search: '',
            status: '',
            membership: '',
            sort: 'name'
        };
        this.setupEventListeners();
        this.setupRealtimeListener();
        this.loadStats();
    }

    async loadStats() {
        try {
            const snapshot = await getDocs(this.usersRef);
            let totalUsers = 0;
            let premiumUsers = 0;
            let activeReaders = 0;
            let newThisMonth = 0;

            const now = new Date();
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            snapshot.forEach(doc => {
                const user = doc.data();
                totalUsers++;
                
                if (user.isPremium) premiumUsers++;
                if (user.lastActive) {
                    const lastActiveDate = user.lastActive instanceof Date ? user.lastActive : 
                                         user.lastActive.toDate ? user.lastActive.toDate() :
                                         new Date(user.lastActive);
                    if ((now - lastActiveDate) < 7 * 24 * 60 * 60 * 1000) {
                        activeReaders++;
                    }
                }
                if (user.created_at) {
                    const createdDate = user.created_at instanceof Date ? user.created_at :
                                      user.created_at.toDate ? user.created_at.toDate() :
                                      new Date(user.created_at);
                    if (createdDate >= firstDayOfMonth) {
                        newThisMonth++;
                    }
                }
            });

            document.getElementById('total-users').textContent = totalUsers;
            document.getElementById('premium-users').textContent = premiumUsers;
            document.getElementById('active-readers').textContent = activeReaders;
            document.getElementById('new-users').textContent = newThisMonth;
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async loadUsers() {
        try {
            let q = query(this.usersRef);

            if (this.filters.status) {
                q = query(q, where('status', '==', this.filters.status));
            }

            if (this.filters.membership) {
                const isPremium = this.filters.membership === 'premium';
                q = query(q, where('isPremium', '==', isPremium));
            }

            q = query(q, orderBy(this.filters.sort));

            const snapshot = await getDocs(q);
            const usersGrid = document.getElementById('users-grid');
            const usersTableBody = document.getElementById('users-table-body');
            
            if (snapshot.empty) {
                const emptyTemplate = document.getElementById('empty-state');
                const emptyState = emptyTemplate.content.cloneNode(true);
                usersGrid.innerHTML = '';
                usersGrid.appendChild(emptyState);
                usersTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                            No users found. Try adjusting your search or filter.
                        </td>
                    </tr>`;
                return;
            }

            usersGrid.innerHTML = '';
            usersTableBody.innerHTML = '';

            for (const doc of snapshot.docs) {
                const user = doc.data();
                
                if (this.filters.search) {
                    const searchTerm = this.filters.search.toLowerCase();
                    const fullName = `${user.firstname} ${user.lastname}`.toLowerCase();
                    const email = user.email.toLowerCase();
                    
                    if (!fullName.includes(searchTerm) && !email.includes(searchTerm)) {
                        continue;
                    }
                }

                const readingStats = await this.getUserReadingStats(doc.id);
                usersGrid.innerHTML += this.createUserCard(doc.id, user, readingStats);
                usersTableBody.innerHTML += this.createUserListItem(doc.id, user, readingStats);
            }
        } catch (error) {
            console.error('Error loading users:', error);
            const errorMessage = `
                <div class="col-span-full text-center py-8 text-red-500">
                    <i class="fas fa-exclamation-circle text-xl mb-2"></i>
                    <p>Error loading users. Please try again later.</p>
                </div>`;
            document.getElementById('users-grid').innerHTML = errorMessage;
            document.getElementById('users-table-body').innerHTML = `
                <tr>
                    <td colspan="6" class="px-4 py-8 text-center text-red-500">
                        Error loading users. Please try again later.
                    </td>
                </tr>`;
        }
    }

    async getUserReadingStats(userId) {
        try {
            const snapshot = await getDocs(query(this.readingStatesRef, where('userId', '==', userId)));
            let totalBooks = 0;
            let completedBooks = 0;
            let inProgress = 0;

            snapshot.forEach(doc => {
                const state = doc.data();
                totalBooks++;
                if (state.status === 'completed') completedBooks++;
                if (state.status === 'reading') inProgress++;
            });

            return { totalBooks, completedBooks, inProgress };
        } catch (error) {
            console.error('Error fetching user reading stats:', error);
            return { totalBooks: 0, completedBooks: 0, inProgress: 0 };
        }
    }

    createUserCard(userId, user, stats) {
        const template = document.getElementById('user-card-template');
        const card = template.content.cloneNode(true);
        const cardElement = card.querySelector('div');
        
        cardElement.dataset.userId = userId;
        
        // Set user avatar and name
        const avatar = card.querySelector('.user-avatar');
        avatar.src = user.avatar || 'https://via.placeholder.com/100';
        avatar.alt = `${user.firstname} ${user.lastname}`;
        
        card.querySelector('.user-name').textContent = `${user.firstname} ${user.lastname}`;
        card.querySelector('.user-email').textContent = user.email;

        // Set status
        const statusColors = {
            'active': 'bg-green-100 text-green-800',
            'inactive': 'bg-gray-100 text-gray-800',
            'blocked': 'bg-red-100 text-red-800'
        };
        const statusElement = card.querySelector('.user-status');
        statusElement.textContent = user.status.charAt(0).toUpperCase() + user.status.slice(1);
        statusElement.className = `user-status px-2 py-1 text-xs rounded-full ${statusColors[user.status] || 'bg-gray-100 text-gray-800'}`;

        // Set membership
        const membershipElement = card.querySelector('.user-membership');
        if (user.isPremium) {
            membershipElement.textContent = 'Premium';
            membershipElement.className = 'user-membership px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full';
        } else {
            membershipElement.textContent = 'Free';
            membershipElement.className = 'user-membership px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full';
        }

        // Set reading stats
        card.querySelector('.user-total-books').textContent = stats.totalBooks;
        card.querySelector('.user-completed-books').textContent = stats.completedBooks;
        card.querySelector('.user-in-progress').textContent = stats.inProgress;

        // Set join date
        const joinDate = user.created_at ? 
            (user.created_at instanceof Date ? user.created_at : 
             user.created_at.toDate ? user.created_at.toDate() : 
             new Date(user.created_at)).toLocaleDateString() : 'N/A';
        card.querySelector('.user-joined').textContent = `Joined: ${joinDate}`;

        // Set up action buttons
        card.querySelector('.edit-user').onclick = () => this.editUser(userId);
        card.querySelector('.delete-user').onclick = () => this.deleteUser(userId);

        return cardElement.outerHTML;
    }

    createUserListItem(userId, user, stats) {
        const template = document.getElementById('user-list-item-template');
        const row = template.content.cloneNode(true);
        const rowElement = row.querySelector('tr');
        
        rowElement.dataset.userId = userId;
        
        // Set user avatar and name
        const avatar = row.querySelector('.user-avatar');
        avatar.src = user.avatar || 'https://via.placeholder.com/32';
        avatar.alt = `${user.firstname} ${user.lastname}`;
        
        row.querySelector('.user-name').textContent = `${user.firstname} ${user.lastname}`;
        row.querySelector('.user-books').textContent = `${stats.totalBooks} books`;
        row.querySelector('.user-email').textContent = user.email;

        // Set status
        const statusColors = {
            'active': 'bg-green-100 text-green-800',
            'inactive': 'bg-gray-100 text-gray-800',
            'blocked': 'bg-red-100 text-red-800'
        };
        const statusElement = row.querySelector('.user-status');
        statusElement.textContent = user.status.charAt(0).toUpperCase() + user.status.slice(1);
        statusElement.className = `user-status px-2 py-1 text-xs rounded-full ${statusColors[user.status] || 'bg-gray-100 text-gray-800'}`;

        // Set membership
        const membershipElement = row.querySelector('.user-membership');
        if (user.isPremium) {
            membershipElement.textContent = 'Premium';
            membershipElement.className = 'user-membership px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full';
        } else {
            membershipElement.textContent = 'Free';
            membershipElement.className = 'user-membership px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full';
        }

        // Set join date
        const joinDate = user.created_at ? 
            (user.created_at instanceof Date ? user.created_at : 
             user.created_at.toDate ? user.created_at.toDate() : 
             new Date(user.created_at)).toLocaleDateString() : 'N/A';
        row.querySelector('.user-joined').textContent = joinDate;

        // Set up action buttons
        row.querySelector('.edit-user').onclick = () => this.editUser(userId);
        row.querySelector('.delete-user').onclick = () => this.deleteUser(userId);

        return rowElement.outerHTML;
    }

    async addUser(formData) {
        try {
            const newUser = {
                firstname: formData.get('firstname'),
                lastname: formData.get('lastname'),
                email: formData.get('email'),
                phone: formData.get('phone'),
                status: formData.get('status'),
                isPremium: formData.get('isPremium') === 'on',
                isVerified: formData.get('isVerified') === 'on',
                avatar: 'https://via.placeholder.com/100',
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            };

            await addDoc(this.usersRef, newUser);
            this.closeModal();
            this.loadStats();
            alert('User added successfully!');
        } catch (error) {
            console.error('Error adding user:', error);
            alert('Error adding user. Please try again.');
        }
    }

    async editUser(userId) {
        try {
            const userDoc = await getDocs(doc(db, 'users', userId));
            if (!userDoc.exists()) {
                throw new Error('User not found');
            }
            const user = userDoc.data();
            
            const modal = document.getElementById('user-modal');
            const form = modal.querySelector('#user-form');
            form.dataset.userId = userId;
            
            document.getElementById('modal-title').textContent = 'Edit User';
            document.getElementById('user-firstname').value = user.firstname;
            document.getElementById('user-lastname').value = user.lastname;
            document.getElementById('user-email').value = user.email;
            document.getElementById('user-phone').value = user.phone || '';
            document.getElementById('user-status').value = user.status;
            document.getElementById('user-premium').checked = user.isPremium;
            document.getElementById('user-verified').checked = user.isVerified;
            document.getElementById('avatar-preview').src = user.avatar || 'https://via.placeholder.com/100';
            
            modal.classList.remove('hidden');
        } catch (error) {
            console.error('Error loading user:', error);
            alert('Error loading user. Please try again.');
        }
    }

    async updateUser(userId, formData) {
        try {
            const updateData = {
                firstname: formData.get('firstname'),
                lastname: formData.get('lastname'),
                email: formData.get('email'),
                phone: formData.get('phone'),
                status: formData.get('status'),
                isPremium: formData.get('isPremium') === 'on',
                isVerified: formData.get('isVerified') === 'on',
                updated_at: serverTimestamp()
            };

            await updateDoc(doc(db, 'users', userId), updateData);
            this.closeModal();
            alert('User updated successfully!');
        } catch (error) {
            console.error('Error updating user:', error);
            alert('Error updating user. Please try again.');
        }
    }

    async deleteUser(userId) {
        if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            try {
                // Check if user has any reading states
                const readingStates = await getDocs(
                    query(this.readingStatesRef, where('userId', '==', userId))
                );
                
                if (!readingStates.empty) {
                    alert(`This user has ${readingStates.size} reading states. Please delete them first.`);
                    return;
                }

                await deleteDoc(doc(db, 'users', userId));
                this.loadStats();
                alert('User deleted successfully!');
            } catch (error) {
                console.error('Error deleting user:', error);
                alert('Error deleting user. Please try again.');
            }
        }
    }

    setupRealtimeListener() {
        onSnapshot(query(this.usersRef, orderBy('updated_at', 'desc')), (snapshot) => {
            this.loadStats();
            this.loadUsers();
        });
    }

    closeModal() {
        const modal = document.getElementById('user-modal');
        const form = modal.querySelector('#user-form');
        form.reset();
        delete form.dataset.userId;
        document.getElementById('avatar-preview').src = 'https://via.placeholder.com/100';
        document.getElementById('modal-title').textContent = 'Add New User';
        modal.classList.add('hidden');
    }

    setupEventListeners() {
        // Search functionality
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.filters.search = e.target.value.toLowerCase();
            this.loadUsers();
        });

        // Status filter
        document.getElementById('status-filter').addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.loadUsers();
        });

        // Membership filter
        document.getElementById('membership-filter').addEventListener('change', (e) => {
            this.filters.membership = e.target.value;
            this.loadUsers();
        });

        // Sort selection
        document.getElementById('sort-select').addEventListener('change', (e) => {
            this.filters.sort = e.target.value;
            this.loadUsers();
        });

        // Add user button
        document.getElementById('add-user-btn').addEventListener('click', () => {
            document.getElementById('user-modal').classList.remove('hidden');
        });

        // Modal controls
        document.getElementById('close-modal').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('cancel-modal').addEventListener('click', () => {
            this.closeModal();
        });

        // Form submission
        document.getElementById('user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = e.target.dataset.userId;
            const formData = new FormData(e.target);

            if (userId) {
                await this.updateUser(userId, formData);
            } else {
                await this.addUser(formData);
            }
        });

        // Avatar change button
        document.getElementById('change-avatar').addEventListener('click', () => {
            alert('Avatar upload functionality will be implemented later');
        });
    }
}

window.usersManager = new UsersManager();
document.addEventListener('DOMContentLoaded', () => {
    window.usersManager.loadUsers();
});