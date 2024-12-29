import { db } from './config.js';
import { 
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc,
    orderBy, onSnapshot, serverTimestamp, limit, getDoc 
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
                
                // Consider user active if onboarding is completed
                if (user.onboarding_step === 'onboarding_completed') {
                    activeReaders++;
                }

                // Check for new users this month using date_of_birth field
                if (user.date_of_birth) {
                    const joinDate = new Date(user.date_of_birth);
                    if (joinDate >= firstDayOfMonth) {
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

            // Apply filters
            if (this.filters.status) {
                const status = this.filters.status === 'active' ? 'onboarding_completed' : this.filters.status;
                q = query(q, where('onboarding_step', '==', status));
            }

            // Sort handling
            switch(this.filters.sort) {
                case 'name':
                    q = query(q, orderBy('full_name'));
                    break;
                case 'joined':
                    q = query(q, orderBy('date_of_birth', 'desc'));
                    break;
                default:
                    q = query(q, orderBy('full_name'));
            }

            const snapshot = await getDocs(q);
            const usersGrid = document.getElementById('users-grid');
            const usersTableBody = document.getElementById('users-table-body');
            
            if (snapshot.empty) {
                usersGrid.innerHTML = `
                    <div class="col-span-full flex flex-col items-center justify-center py-8 text-gray-500">
                        <i class="fas fa-users text-4xl mb-2"></i>
                        <p>No users found. Try adjusting your search or filter.</p>
                    </div>`;
                return;
            }

            usersGrid.innerHTML = '';
            usersTableBody.innerHTML = '';

            for (const doc of snapshot.docs) {
                const user = doc.data();
                
                // Apply search filter
                if (this.filters.search) {
                    const searchTerm = this.filters.search.toLowerCase();
                    const fullName = user.full_name?.toLowerCase() || '';
                    const email = user.email?.toLowerCase() || '';
                    
                    if (!fullName.includes(searchTerm) && !email.includes(searchTerm)) {
                        continue;
                    }
                }

                // Get reading stats
                const readingStats = await this.getUserReadingStats(doc.id);
                
                // Create and append user card
                usersGrid.innerHTML += this.createUserCard(doc.id, user, readingStats);
            }

        } catch (error) {
            console.error('Error loading users:', error);
            const errorMessage = `
                <div class="col-span-full flex flex-col items-center justify-center py-8 text-red-500">
                    <i class="fas fa-exclamation-circle text-4xl mb-2"></i>
                    <p>Error loading users. Please try again later.</p>
                </div>`;
            document.getElementById('users-grid').innerHTML = errorMessage;
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
        avatar.alt = user.full_name || '';
        
        card.querySelector('.user-name').textContent = user.full_name || '';
        card.querySelector('.user-email').textContent = user.email || '';
        card.querySelector('.user-phone').textContent = user.phone_number || '';

        // Set status and age
        const statusElement = card.querySelector('.user-status');
        const status = user.onboarding_step === 'onboarding_completed' ? 'active' : 'pending';
        statusElement.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        statusElement.className = `user-status px-2 py-1 text-xs rounded-full ${
            status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
        }`;

        // Set age range
        card.querySelector('.user-age').textContent = user.age_range || 'N/A';

        // Set country and onboarding
        card.querySelector('.user-country').textContent = user.country || 'N/A';
        card.querySelector('.user-onboarding').textContent = 
            user.onboarding_step?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Not Started';

        // Set preferred genres
        const genres = user.preferred_genres || [];
        card.querySelector('.user-genres').textContent = 
            genres.length > 0 ? `${genres.length} genres` : 'None';

        // Set join date
        const joinDate = user.date_of_birth ? 
            new Date(user.date_of_birth).toLocaleDateString() : 'N/A';
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
            const userDoc = await getDoc(doc(this.usersRef, userId));
            if (!userDoc.exists()) {
                throw new Error('User not found');
            }
            const user = userDoc.data();
            
            const modal = document.getElementById('user-modal');
            const form = modal.querySelector('#user-form');
            form.dataset.userId = userId;
            
            document.getElementById('modal-title').textContent = 'Edit User';
            document.getElementById('user-firstname').value = user.firstname || user.full_name || '';
            document.getElementById('user-lastname').value = user.lastname || '';
            document.getElementById('user-email').value = user.email || '';
            document.getElementById('user-phone').value = user.phone_number || user.phone || '';
            document.getElementById('user-status').value = user.status || 'active';
            document.getElementById('user-premium').checked = user.isPremium || false;
            document.getElementById('user-verified').checked = user.isVerified || false;
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