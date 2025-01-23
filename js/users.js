import { db } from './config.js';
import { 
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc,
    orderBy, onSnapshot, serverTimestamp, limit, getDoc 
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

class UsersManager {
    constructor() {
        this.usersRef = collection(db, 'users');
        this.readingStatesRef = collection(db, 'reading_states');
        
        // GitHub configuration
        this.GITHUB_TOKEN = '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';
        this.REPO_OWNER = 'taiayman';
        this.REPO_NAME = 'pdf-storage';
        this.BRANCH = 'main';
        
        // Default avatar
        this.defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNGM0Y0RjYiLz48cGF0aCBkPSJNMTAwIDEwMEMxMjMuMDkgMTAwIDE0MiA4MS4wOSAxNDIgNThDMTQyIDM0LjkxIDEyMy4wOSAxNiAxMDAgMTZDNzYuOTEgMTYgNTggMzQuOTEgNTggNThDNTggODEuMDkgNzYuOTEgMTAwIDEwMCAxMDBaIiBmaWxsPSIjRDFENURCIi8+PHBhdGggZD0iTTUwIDE4MEg1MEMxNTAgMTgwIDE1MCAxMjAgMTUwIDEyMEMxNTAgMTIwIDE1MCAxODAgNTAgMTgwWiIgZmlsbD0iI0QxRDVEQiIvPjwvc3ZnPg==';
        
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

    // Read file as base64
    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64Content = reader.result.split(',')[1];
                resolve(base64Content);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async uploadToGitHub(file) {
        try {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                throw new Error('Image size must be less than 5 MB');
            }

            const content = await this.readFileAsBase64(file);
            const timestamp = Date.now();
            const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `avatars/${timestamp}_${sanitizedName}`;

            console.log('Uploading avatar to GitHub:', {
                path,
                size: file.size,
                type: file.type
            });

            const response = await fetch(`https://api.github.com/repos/${this.REPO_OWNER}/${this.REPO_NAME}/contents/${path}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.GITHUB_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    message: `Upload avatar: ${file.name}`,
                    content: content,
                    branch: this.BRANCH
                })
            });

            const responseData = await response.json();
            
            if (!response.ok) {
                console.error('GitHub API Error Response:', responseData);
                throw new Error(`Failed to upload avatar to GitHub: ${responseData.message}`);
            }

            // Use jsDelivr CDN URL for faster delivery
            const cdnUrl = `https://cdn.jsdelivr.net/gh/${this.REPO_OWNER}/${this.REPO_NAME}@${this.BRANCH}/${path}`;
            console.log('Successfully uploaded avatar. CDN URL:', cdnUrl);
            
            return cdnUrl;
        } catch (error) {
            console.error('GitHub avatar upload error:', error);
            throw error;
        }
    }

    showLoading(container) {
        container.innerHTML = `
            <div class="flex items-center justify-center p-4">
                <div class="flex items-center gap-3">
                    <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500"></div>
                    <span class="text-sm text-gray-700">Uploading avatar...</span>
                </div>
            </div>
        `;
    }

    resetAvatarUpload() {
        const avatarPreviewContainer = document.getElementById('avatar-preview-container');
        const avatarInput = document.getElementById('user-avatar-upload');
        const avatarUrlInput = document.getElementById('user-avatar-url');

        avatarPreviewContainer.innerHTML = `
            <div id="avatar-upload-prompt" class="text-center">
                <i class="fas fa-cloud-upload-alt text-4xl text-orange-400 mb-2"></i>
                <p class="text-sm text-gray-600">Drag and drop an image here, or</p>
                <button type="button" onclick="document.getElementById('user-avatar-upload').click()" 
                        class="mt-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors">
                    Choose Image
                </button>
            </div>
        `;

        avatarInput.value = '';
        avatarUrlInput.value = '';
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

            // Clear existing content
            usersGrid.innerHTML = '';
            usersTableBody.innerHTML = '';

            // Create document fragment for better performance
            const gridFragment = document.createDocumentFragment();
            const listFragment = document.createDocumentFragment();

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
                
                // Create grid card
                const cardDiv = document.createElement('div');
                cardDiv.innerHTML = this.createUserCard(doc.id, user, readingStats);
                const card = cardDiv.firstElementChild;
                
                if (card) {
                    const editButton = card.querySelector('.edit-user');
                    const deleteButton = card.querySelector('.delete-user');
                    
                    if (editButton) {
                        editButton.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.editUser(doc.id);
                        });
                    }
                    
                    if (deleteButton) {
                        deleteButton.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.deleteUser(doc.id);
                        });
                    }
                    
                    gridFragment.appendChild(card);
                }
                
                // Create list item
                const listDiv = document.createElement('div');
                listDiv.innerHTML = this.createUserListItem(doc.id, user, readingStats);
                const listItem = listDiv.firstElementChild;
                
                if (listItem) {
                    const listEditButton = listItem.querySelector('.edit-user');
                    const listDeleteButton = listItem.querySelector('.delete-user');
                    
                    if (listEditButton) {
                        listEditButton.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.editUser(doc.id);
                        });
                    }
                    
                    if (listDeleteButton) {
                        listDeleteButton.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.deleteUser(doc.id);
                        });
                    }
                    
                    listFragment.appendChild(listItem);
                }
            }

            // Append all elements at once
            usersGrid.appendChild(gridFragment);
            usersTableBody.appendChild(listFragment);

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
        avatar.src = user.profile_image_url || this.defaultAvatar;
        avatar.alt = user.full_name || '';
        
        card.querySelector('.user-name').textContent = user.full_name || 'Unnamed User';
        card.querySelector('.user-email').textContent = user.email || 'No email';
        card.querySelector('.user-phone').textContent = user.phone_number || 'No phone';

        // Set status based on onboarding_step
        const status = user.onboarding_step === 'onboarding_completed' ? 'active' : 'pending';
        const statusColors = {
            'active': 'bg-green-100 text-green-800',
            'pending': 'bg-yellow-100 text-yellow-800',
            'blocked': 'bg-red-100 text-red-800'
        };
        const statusElement = card.querySelector('.user-status');
        statusElement.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        statusElement.className = `user-status px-2 py-1 text-xs rounded-full ${statusColors[status] || 'bg-gray-100 text-gray-800'}`;

        // Set age range
        const ageElement = card.querySelector('.user-age');
        if (ageElement) {
            ageElement.textContent = user.age_range || 'N/A';
            ageElement.className = 'user-age px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full';
        }

        // Set country and onboarding info
        const countryElement = card.querySelector('.user-country');
        if (countryElement) {
            countryElement.textContent = user.country || 'N/A';
        }

        const onboardingElement = card.querySelector('.user-onboarding');
        if (onboardingElement) {
            onboardingElement.textContent = user.onboarding_step?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Not Started';
        }

        // Set preferred genres
        const genresElement = card.querySelector('.user-genres');
        if (genresElement) {
            const genres = user.preferred_genres || [];
            genresElement.textContent = genres.length > 0 ? `${genres.length} genres` : 'None';
        }

        // Set join date using date_of_birth as join date
        const joinDate = user.date_of_birth ? 
            new Date(user.date_of_birth).toLocaleDateString() : 'N/A';
        card.querySelector('.user-joined').textContent = `Joined: ${joinDate}`;

        // Set up action buttons with proper event listeners
        const editButton = card.querySelector('.edit-user');
        const deleteButton = card.querySelector('.delete-user');
        
        const manager = this;
        editButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            manager.editUser(userId);
        });
        
        deleteButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            manager.deleteUser(userId);
        });

        const wrapper = document.createElement('div');
        wrapper.appendChild(card);
        return wrapper.innerHTML;
    }

    createUserListItem(userId, user, stats) {
        const template = document.getElementById('user-list-item-template');
        const row = template.content.cloneNode(true);
        const rowElement = row.querySelector('tr');
        
        rowElement.dataset.userId = userId;
        
        // Set user avatar and name
        const avatar = row.querySelector('.user-avatar');
        avatar.src = user.profile_image_url || this.defaultAvatar;
        avatar.alt = user.full_name || '';
        
        row.querySelector('.user-name').textContent = user.full_name || 'Unnamed User';
        row.querySelector('.user-books').textContent = `${stats?.totalBooks || 0} books`;
        row.querySelector('.user-email').textContent = user.email || 'No email';

        // Set status based on onboarding_step
        const status = user.onboarding_step === 'onboarding_completed' ? 'active' : 'pending';
        const statusColors = {
            'active': 'bg-green-100 text-green-800',
            'pending': 'bg-yellow-100 text-yellow-800',
            'blocked': 'bg-red-100 text-red-800'
        };
        const statusElement = row.querySelector('.user-status');
        statusElement.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        statusElement.className = `user-status px-2 py-1 text-xs rounded-full ${statusColors[status] || 'bg-gray-100 text-gray-800'}`;

        // Set join date using date_of_birth as join date
        const joinDate = user.date_of_birth ? 
            new Date(user.date_of_birth).toLocaleDateString() : 'N/A';
        row.querySelector('.user-joined').textContent = joinDate;

        // Set up action buttons with proper event listeners
        const editButton = row.querySelector('.edit-user');
        const deleteButton = row.querySelector('.delete-user');
        
        const manager = this;
        editButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            manager.editUser(userId);
        });
        
        deleteButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            manager.deleteUser(userId);
        });

        const wrapper = document.createElement('div');
        wrapper.appendChild(row);
        return wrapper.innerHTML;
    }

    async addUser(formData) {
        try {
            const newUser = {
                full_name: formData.get('name'),
                email: formData.get('email'),
                phone_number: formData.get('phone'),
                onboarding_step: formData.get('status') === 'active' ? 'onboarding_completed' : 'pending',
                profile_image_url: formData.get('avatarUrl') || this.defaultAvatar,
                date_of_birth: new Date().toISOString(),
                updated_at: serverTimestamp(),
                created_at: serverTimestamp()
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
            document.getElementById('user-name').value = user.full_name || '';
            document.getElementById('user-email').value = user.email || '';
            document.getElementById('user-phone').value = user.phone_number || '';
            document.getElementById('user-status').value = user.onboarding_step === 'onboarding_completed' ? 'active' : 'pending';
            
            // Reset avatar upload
            this.resetAvatarUpload();
            
            // Handle avatar preview if exists
            if (user.profile_image_url && user.profile_image_url !== this.defaultAvatar) {
                const avatarPreviewContainer = document.getElementById('avatar-preview-container');
                avatarPreviewContainer.innerHTML = `
                    <div id="avatar-upload-prompt" class="text-center">
                        <i class="fas fa-cloud-upload-alt text-4xl text-orange-400 mb-2"></i>
                        <p class="text-sm text-gray-600">Drag and drop an image here, or</p>
                        <button type="button" onclick="document.getElementById('user-avatar-upload').click()" 
                                class="mt-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors">
                            Choose Image
                        </button>
                        <div class="mt-4">
                            <img src="${user.profile_image_url}" alt="${user.full_name || ''}" class="mx-auto w-32 h-32 rounded-full object-cover border-2 border-gray-200">
                        </div>
                    </div>
                `;
                document.getElementById('user-avatar-url').value = user.profile_image_url;
            }
            
            modal.classList.remove('hidden');
        } catch (error) {
            console.error('Error loading user:', error);
            alert('Error loading user. Please try again.');
        }
    }

    async updateUser(userId, formData) {
        try {
            const updateData = {
                full_name: formData.get('name'),
                email: formData.get('email'),
                phone_number: formData.get('phone'),
                onboarding_step: formData.get('status') === 'active' ? 'onboarding_completed' : 'pending',
                updated_at: serverTimestamp()
            };

            // Only update avatar URL if a new image was uploaded
            if (formData.get('avatarUrl')) {
                updateData.profile_image_url = formData.get('avatarUrl');
            }

            await updateDoc(doc(this.usersRef, userId), updateData);
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

                await deleteDoc(doc(this.usersRef, userId));
                this.loadStats();
                alert('User deleted successfully!');
            } catch (error) {
                console.error('Error deleting user:', error);
                alert('Error deleting user. Please try again.');
            }
        }
    }

    setupRealtimeListener() {
        onSnapshot(query(this.usersRef, orderBy('created_at', 'desc')), (snapshot) => {
            this.loadStats();
            this.loadUsers();
        });
    }

    closeModal() {
        const modal = document.getElementById('user-modal');
        const form = modal.querySelector('#user-form');
        form.reset();
        delete form.dataset.userId;
        
        // Reset avatar upload
        this.resetAvatarUpload();
        
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

        // Avatar upload handling
        const avatarInput = document.getElementById('user-avatar-upload');
        const avatarPreviewContainer = document.getElementById('avatar-preview-container');

        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.type.startsWith('image/')) {
                    try {
                        this.showLoading(avatarPreviewContainer);
                        const url = await this.uploadToGitHub(file);
                        
                        avatarPreviewContainer.innerHTML = `
                            <div id="avatar-upload-prompt" class="text-center">
                                <i class="fas fa-cloud-upload-alt text-4xl text-orange-400 mb-2"></i>
                                <p class="text-sm text-gray-600">Drag and drop an image here, or</p>
                                <button type="button" onclick="document.getElementById('user-avatar-upload').click()" 
                                        class="mt-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors">
                                    Choose Image
                                </button>
                                <div class="mt-4">
                                    <img src="${url}" alt="" class="mx-auto w-32 h-32 rounded-full object-cover border-2 border-gray-200">
                                </div>
                            </div>
                        `;
                        document.getElementById('user-avatar-url').value = url;
                    } catch (error) {
                        alert(error.message);
                        this.resetAvatarUpload();
                    }
                } else {
                    alert('Please select an image file.');
                    this.resetAvatarUpload();
                }
            }
        });

        // Drag and drop handling for avatar
        avatarPreviewContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            avatarPreviewContainer.classList.add('border-orange-500');
        });

        avatarPreviewContainer.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            avatarPreviewContainer.classList.remove('border-orange-500');
        });

        avatarPreviewContainer.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            avatarPreviewContainer.classList.remove('border-orange-500');

            const file = e.dataTransfer.files[0];
            if (file) {
                if (file.type.startsWith('image/')) {
                    avatarInput.files = e.dataTransfer.files;
                    const event = new Event('change');
                    avatarInput.dispatchEvent(event);
                } else {
                    alert('Please drop an image file.');
                }
            }
        });
    }
}

window.usersManager = new UsersManager();
document.addEventListener('DOMContentLoaded', () => {
    window.usersManager.loadUsers();
});
