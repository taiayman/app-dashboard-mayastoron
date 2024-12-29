import { db } from './config.js';
import { 
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc,
    orderBy, onSnapshot, serverTimestamp, limit 
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

class ReadingStatesManager {
    constructor() {
        this.statesRef = collection(db, 'reading_states');
        this.usersRef = collection(db, 'users');
        this.booksRef = collection(db, 'books');
        this.filters = {
            search: '',
            status: '',
            progress: '',
            sort: 'updated_at'
        };
        this.setupEventListeners();
        this.setupRealtimeListener();
        this.loadStats();
    }

    async loadStats() {
        try {
            const snapshot = await getDocs(this.statesRef);
            let totalStates = 0;
            let readingCount = 0;
            let completedCount = 0;
            let totalProgress = 0;

            snapshot.forEach(doc => {
                const state = doc.data();
                totalStates++;
                totalProgress += state.progress || 0;

                if (state.status === 'reading') readingCount++;
                if (state.status === 'completed') completedCount++;
            });

            const avgProgress = totalStates > 0 ? Math.round(totalProgress / totalStates) : 0;

            document.getElementById('total-states').textContent = totalStates;
            document.getElementById('reading-count').textContent = readingCount;
            document.getElementById('completed-count').textContent = completedCount;
            document.getElementById('avg-progress').textContent = `${avgProgress}%`;
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async loadStates() {
        try {
            let q = query(this.statesRef);

            if (this.filters.status) {
                q = query(q, where('status', '==', this.filters.status));
            }

            if (this.filters.progress) {
                const [min, max] = this.filters.progress.split('-').map(Number);
                q = query(q, 
                    where('progress', '>=', min),
                    where('progress', '<=', max)
                );
            }

            q = query(q, orderBy(this.filters.sort, 'desc'));

            const snapshot = await getDocs(q);
            const statesGrid = document.getElementById('states-grid');
            const statesTableBody = document.getElementById('states-table-body');
            
            if (snapshot.empty) {
                const emptyMessage = `
                    <div class="col-span-full text-center py-8 text-gray-500">
                        No reading states found
                    </div>`;
                statesGrid.innerHTML = emptyMessage;
                statesTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                            No reading states found
                        </td>
                    </tr>`;
                return;
            }

            statesGrid.innerHTML = '';
            statesTableBody.innerHTML = '';

            for (const doc of snapshot.docs) {
                const state = doc.data();
                const user = await this.getUser(state.userId);
                const book = await this.getBook(state.bookId);

                if (this.filters.search) {
                    const searchTerm = this.filters.search.toLowerCase();
                    const userName = user?.name?.toLowerCase() || '';
                    const bookTitle = book?.title?.toLowerCase() || '';
                    
                    if (!userName.includes(searchTerm) && !bookTitle.includes(searchTerm)) {
                        continue;
                    }
                }

                statesGrid.innerHTML += this.createStateCard(doc.id, state, user, book);
                statesTableBody.innerHTML += this.createStateListItem(doc.id, state, user, book);
            }
        } catch (error) {
            console.error('Error loading states:', error);
        }
    }

    async getUser(userId) {
        try {
            const userDoc = await getDocs(doc(db, 'users', userId));
            return userDoc.exists() ? userDoc.data() : null;
        } catch (error) {
            console.error('Error fetching user:', error);
            return null;
        }
    }

    async getBook(bookId) {
        try {
            const bookDoc = await getDocs(doc(db, 'books', bookId));
            return bookDoc.exists() ? bookDoc.data() : null;
        } catch (error) {
            console.error('Error fetching book:', error);
            return null;
        }
    }

    createStateCard(stateId, state, user, book) {
        const statusColors = {
            'reading': 'bg-blue-100 text-blue-800',
            'completed': 'bg-green-100 text-green-800',
            'on-hold': 'bg-yellow-100 text-yellow-800',
            'dropped': 'bg-red-100 text-red-800'
        };

        const statusColor = statusColors[state.status] || 'bg-gray-100 text-gray-800';
        const lastUpdated = state.updated_at ? new Date(state.updated_at.toDate()).toLocaleDateString() : 'N/A';

        return `
            <div class="bg-white rounded-xl shadow-sm overflow-hidden group hover:shadow-lg transition-shadow duration-300" 
                 data-state-id="${stateId}">
                <div class="relative h-32 bg-gray-100">
                    <img src="${book?.imageUrl || 'https://via.placeholder.com/300x200?text=No+Cover'}" 
                         alt="${book?.title || 'Unknown Book'}"
                         class="w-full h-full object-cover"
                         onerror="this.src='https://via.placeholder.com/300x200?text=Error+Loading+Cover'">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    <div class="absolute bottom-0 left-0 right-0 p-3 text-white">
                        <h3 class="font-semibold text-sm line-clamp-1">${book?.title || 'Unknown Book'}</h3>
                        <p class="text-xs opacity-90">${user?.name || 'Unknown User'}</p>
                    </div>
                </div>
                <div class="p-4">
                    <div class="flex items-center justify-between mb-3">
                        <span class="px-2 py-1 text-xs rounded-full ${statusColor}">
                            ${state.status.charAt(0).toUpperCase() + state.status.slice(1)}
                        </span>
                        <span class="text-sm text-gray-500">Updated: ${lastUpdated}</span>
                    </div>
                    <div class="mb-3">
                        <div class="flex items-center justify-between text-sm mb-1">
                            <span class="text-gray-600">Progress</span>
                            <span class="font-medium">${state.progress || 0}%</span>
                        </div>
                        <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div class="h-full bg-orange-500 transition-all duration-300"
                                 style="width: ${state.progress || 0}%"></div>
                        </div>
                    </div>
                    ${state.notes ? `
                        <p class="text-sm text-gray-600 mb-3 line-clamp-2">${state.notes}</p>
                    ` : ''}
                    <div class="flex justify-end space-x-2 pt-2 border-t">
                        <button onclick="readingStatesManager.editState('${stateId}')"
                                class="p-2 text-orange-500 hover:text-orange-700 transition-colors">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="readingStatesManager.deleteState('${stateId}')"
                                class="p-2 text-red-500 hover:text-red-700 transition-colors">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                            </div>
                        </div>
        `;
    }

    createStateListItem(stateId, state, user, book) {
        const statusColors = {
            'reading': 'bg-blue-100 text-blue-800',
            'completed': 'bg-green-100 text-green-800',
            'on-hold': 'bg-yellow-100 text-yellow-800',
            'dropped': 'bg-red-100 text-red-800'
        };

        const statusColor = statusColors[state.status] || 'bg-gray-100 text-gray-800';
        const lastUpdated = state.updated_at ? new Date(state.updated_at.toDate()).toLocaleDateString() : 'N/A';

        return `
            <tr class="border-b hover:bg-gray-50" data-state-id="${stateId}">
                <td class="px-4 py-3">
                    <div class="flex items-center space-x-3">
                        <img src="${user?.avatar || 'https://via.placeholder.com/32'}" 
                             alt="${user?.name || 'Unknown User'}"
                             class="w-8 h-8 rounded-full"
                             onerror="this.src='https://via.placeholder.com/32'">
                        <span class="font-medium text-gray-900">${user?.name || 'Unknown User'}</span>
                    </div>
                </td>
                <td class="px-4 py-3">
                    <div class="flex items-center space-x-3">
                        <img src="${book?.imageUrl || 'https://via.placeholder.com/32'}" 
                             alt="${book?.title || 'Unknown Book'}"
                             class="w-8 h-12 object-cover rounded"
                             onerror="this.src='https://via.placeholder.com/32'">
                        <span class="font-medium text-gray-900">${book?.title || 'Unknown Book'}</span>
                    </div>
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-1 text-xs rounded-full ${statusColor}">
                        ${state.status.charAt(0).toUpperCase() + state.status.slice(1)}
                    </span>
                </td>
                <td class="px-4 py-3">
                    <div class="flex items-center space-x-2">
                        <div class="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div class="h-full bg-orange-500 transition-all duration-300"
                                 style="width: ${state.progress || 0}%"></div>
                        </div>
                        <span class="text-sm text-gray-600">${state.progress || 0}%</span>
                    </div>
                </td>
                <td class="px-4 py-3">
                    <span class="text-sm text-gray-600">${lastUpdated}</span>
                </td>
                <td class="px-4 py-3">
                    <div class="flex items-center space-x-2">
                        <button onclick="readingStatesManager.editState('${stateId}')" 
                                class="p-2 text-orange-500 hover:text-orange-700 transition-colors">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="readingStatesManager.deleteState('${stateId}')"
                                class="p-2 text-red-500 hover:text-red-700 transition-colors">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    async editState(stateId) {
        try {
            const stateDoc = await getDocs(doc(db, 'reading_states', stateId));
            if (!stateDoc.exists()) {
                throw new Error('Reading state not found');
            }
            const state = stateDoc.data();
            
            const modal = document.getElementById('state-modal');
            const form = modal.querySelector('#state-form');
            form.dataset.stateId = stateId;
            
            document.getElementById('state-status').value = state.status;
            document.getElementById('state-progress').value = state.progress || 0;
            document.getElementById('state-notes').value = state.notes || '';
            document.getElementById('progress-bar').style.width = `${state.progress || 0}%`;
            
            modal.classList.remove('hidden');
        } catch (error) {
            console.error('Error loading state:', error);
            alert('Error loading reading state. Please try again.');
        }
    }

    async updateState(stateId, formData) {
        try {
            const updateData = {
                status: formData.get('status'),
                progress: parseInt(formData.get('progress')),
                notes: formData.get('notes'),
                updated_at: serverTimestamp()
            };

            await updateDoc(doc(db, 'reading_states', stateId), updateData);
            this.closeModal();
            this.loadStats();
            alert('Reading state updated successfully!');
        } catch (error) {
            console.error('Error updating state:', error);
            alert('Error updating reading state. Please try again.');
        }
    }

    async deleteState(stateId) {
        if (confirm('Are you sure you want to delete this reading state? This action cannot be undone.')) {
            try {
                await deleteDoc(doc(db, 'reading_states', stateId));
                this.loadStats();
                alert('Reading state deleted successfully!');
            } catch (error) {
                console.error('Error deleting state:', error);
                alert('Error deleting reading state. Please try again.');
            }
        }
    }

    setupRealtimeListener() {
        onSnapshot(query(this.statesRef, orderBy('updated_at', 'desc')), (snapshot) => {
            this.loadStats();
            this.loadStates();
        });
    }

    closeModal() {
        const modal = document.getElementById('state-modal');
        const form = modal.querySelector('#state-form');
        form.reset();
        delete form.dataset.stateId;
        document.getElementById('progress-bar').style.width = '0%';
        modal.classList.add('hidden');
    }

    setupEventListeners() {
        // Search functionality
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.filters.search = e.target.value.toLowerCase();
            this.loadStates();
        });

        // Status filter
        document.getElementById('status-filter').addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.loadStates();
        });

        // Progress filter
        document.getElementById('progress-filter').addEventListener('change', (e) => {
            this.filters.progress = e.target.value;
            this.loadStates();
        });

        // Sort selection
        document.getElementById('sort-select').addEventListener('change', (e) => {
            this.filters.sort = e.target.value;
            this.loadStates();
        });

        // Modal controls
        document.getElementById('close-modal').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('cancel-modal').addEventListener('click', () => {
            this.closeModal();
        });

        // Form submission
        document.getElementById('state-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const stateId = e.target.dataset.stateId;
            const formData = new FormData(e.target);

            if (stateId) {
                await this.updateState(stateId, formData);
            }
        });
    }
}

window.readingStatesManager = new ReadingStatesManager();
document.addEventListener('DOMContentLoaded', () => {
    window.readingStatesManager.loadStates();
}); 