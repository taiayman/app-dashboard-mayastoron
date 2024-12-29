import { db } from './config.js';

class GenresManager {
    constructor() {
        this.genresRef = collection(db, 'academic_genres');
        this.booksRef = collection(db, 'books');
        this.setupEventListeners();
        this.setupRealtimeListener();
        this.loadStats();
    }

    async loadStats() {
        try {
            // Get all genres
            const genresSnapshot = await getDocs(this.genresRef);
            const totalGenres = genresSnapshot.size;
            document.getElementById('total-genres').textContent = totalGenres;

            // Get all books to calculate genre usage
            const booksSnapshot = await getDocs(this.booksRef);
            const genreUsage = {};
            let totalTagged = 0;

            booksSnapshot.forEach(doc => {
                const book = doc.data();
                if (book.genres && Array.isArray(book.genres)) {
                    totalTagged++;
                    book.genres.forEach(genre => {
                        genreUsage[genre] = (genreUsage[genre] || 0) + 1;
                    });
                }
            });

            // Find most used genre
            let mostUsedGenre = '-';
            let maxUsage = 0;
            Object.entries(genreUsage).forEach(([genre, count]) => {
                if (count > maxUsage) {
                    mostUsedGenre = genre;
                    maxUsage = count;
                }
            });

            document.getElementById('most-used-genre').textContent = mostUsedGenre;
            document.getElementById('books-tagged').textContent = totalTagged;

            // Get last added genre
            const lastGenreSnapshot = await getDocs(
                query(this.genresRef, orderBy('created_at', 'desc'), limit(1))
            );
            if (!lastGenreSnapshot.empty) {
                const lastGenre = lastGenreSnapshot.docs[0].data();
                document.getElementById('last-added').textContent = lastGenre.name;
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async loadGenres() {
        try {
            const snapshot = await getDocs(query(this.genresRef, orderBy('name')));
            const genresGrid = document.getElementById('genres-grid');
            
            if (snapshot.empty) {
                genresGrid.innerHTML = `
                    <div class="col-span-full text-center py-8 text-gray-500">
                        No genres found. Click "Add New Genre" to create one.
                    </div>`;
                return;
            }

            genresGrid.innerHTML = '';
            snapshot.forEach(doc => {
                const genre = doc.data();
                genresGrid.innerHTML += this.createGenreCard(doc.id, genre);
            });
        } catch (error) {
            console.error('Error loading genres:', error);
        }
    }

    createGenreCard(genreId, genre) {
        return `
            <div class="bg-white rounded-xl shadow-sm overflow-hidden group hover:shadow-lg transition-shadow duration-300" 
                 data-genre-id="${genreId}">
                <div class="p-4">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center space-x-3">
                            <div class="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-xl">
                                ${this.getGenreIcon(genre.icon)}
                            </div>
                            <div>
                                <h3 class="font-semibold text-gray-800">${genre.name}</h3>
                                <p class="text-sm text-gray-500">${genre.books || 0} books</p>
                            </div>
                        </div>
                        ${genre.featured ? `
                            <span class="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                                Featured
                            </span>
                        ` : ''}
                    </div>
                    <p class="text-sm text-gray-600 mb-4 line-clamp-2">${genre.description}</p>
                    <div class="flex justify-end space-x-2 pt-3 border-t">
                        <button onclick="genresManager.editGenre('${genreId}')"
                                class="p-2 text-orange-500 hover:text-orange-700 transition-colors">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="genresManager.deleteGenre('${genreId}')"
                                class="p-2 text-red-500 hover:text-red-700 transition-colors">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    getGenreIcon(iconName) {
        const icons = {
            'book': '📚',
            'science': '🔬',
            'math': '📐',
            'history': '🏛️',
            'language': '📝',
            'art': '🎨',
            'music': '🎵',
            'technology': '💻',
            'business': '💼',
            'health': '⚕️'
        };
        return icons[iconName] || '📚';
    }

    async addGenre(formData) {
        try {
            const newGenre = {
                name: formData.get('name'),
                description: formData.get('description'),
                icon: formData.get('icon'),
                featured: formData.get('featured') === 'on',
                books: 0,
                created_at: serverTimestamp()
            };

            await addDoc(this.genresRef, newGenre);
            this.closeModal();
            this.loadStats();
            alert('Genre added successfully!');
        } catch (error) {
            console.error('Error adding genre:', error);
            alert('Error adding genre. Please try again.');
        }
    }

    async editGenre(genreId) {
        try {
            const genreDoc = await getDoc(doc(db, 'academic_genres', genreId));
            if (!genreDoc.exists()) {
                throw new Error('Genre not found');
            }
            const genre = genreDoc.data();
            
            const modal = document.getElementById('genre-modal');
            const form = modal.querySelector('#genre-form');
            form.dataset.genreId = genreId;
            
            document.getElementById('modal-title').textContent = 'Edit Genre';
            document.getElementById('genre-name').value = genre.name;
            document.getElementById('genre-description').value = genre.description;
            document.getElementById('genre-icon').value = genre.icon;
            document.getElementById('genre-featured').checked = genre.featured;
            
            modal.classList.remove('hidden');
        } catch (error) {
            console.error('Error loading genre:', error);
            alert('Error loading genre. Please try again.');
        }
    }

    async updateGenre(genreId, formData) {
        try {
            const updateData = {
                name: formData.get('name'),
                description: formData.get('description'),
                icon: formData.get('icon'),
                featured: formData.get('featured') === 'on'
            };

            await updateDoc(doc(db, 'academic_genres', genreId), updateData);
            this.closeModal();
            alert('Genre updated successfully!');
        } catch (error) {
            console.error('Error updating genre:', error);
            alert('Error updating genre. Please try again.');
        }
    }

    async deleteGenre(genreId) {
        if (confirm('Are you sure you want to delete this genre? This action cannot be undone.')) {
            try {
                // Check if genre is used in any books
                const booksSnapshot = await getDocs(
                    query(this.booksRef, where('genres', 'array-contains', genreId))
                );
                
                if (!booksSnapshot.empty) {
                    alert(`This genre is used in ${booksSnapshot.size} books. Please remove it from all books first.`);
                    return;
                }

                await deleteDoc(doc(db, 'academic_genres', genreId));
                this.loadStats();
                alert('Genre deleted successfully!');
            } catch (error) {
                console.error('Error deleting genre:', error);
                alert('Error deleting genre. Please try again.');
            }
        }
    }

    setupRealtimeListener() {
        onSnapshot(query(this.genresRef, orderBy('name')), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const genreId = change.doc.id;
                const genre = change.doc.data();
                const genreElement = document.querySelector(`[data-genre-id="${genreId}"]`);

                if (change.type === 'added' && !genreElement) {
                    const genresGrid = document.getElementById('genres-grid');
                    const emptyMessage = genresGrid.querySelector('.col-span-full');
                    if (emptyMessage) {
                        genresGrid.innerHTML = '';
                    }
                    genresGrid.insertAdjacentHTML('beforeend', this.createGenreCard(genreId, genre));
                } else if (change.type === 'modified' && genreElement) {
                    genreElement.outerHTML = this.createGenreCard(genreId, genre);
                } else if (change.type === 'removed' && genreElement) {
                    genreElement.remove();
                    if (document.getElementById('genres-grid').children.length === 0) {
                        this.loadGenres(); // Reload to show empty message
                    }
                }
            });
        });
    }

    closeModal() {
        const modal = document.getElementById('genre-modal');
        const form = modal.querySelector('#genre-form');
        form.reset();
        delete form.dataset.genreId;
        document.getElementById('modal-title').textContent = 'Add New Genre';
        modal.classList.add('hidden');
    }

    setupEventListeners() {
        // Search functionality
        document.getElementById('search-input').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const genres = document.querySelectorAll('[data-genre-id]');
            
            genres.forEach(genre => {
                const name = genre.querySelector('h3').textContent.toLowerCase();
                const description = genre.querySelector('p').textContent.toLowerCase();
                
                if (name.includes(searchTerm) || description.includes(searchTerm)) {
                    genre.classList.remove('hidden');
                } else {
                    genre.classList.add('hidden');
                }
            });
        });

        // Modal controls
        document.getElementById('add-genre-btn').addEventListener('click', () => {
            document.getElementById('genre-modal').classList.remove('hidden');
        });

        document.getElementById('close-modal').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('cancel-modal').addEventListener('click', () => {
            this.closeModal();
        });

        // Form submission
        document.getElementById('genre-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const genreId = e.target.dataset.genreId;
            const formData = new FormData(e.target);

            if (genreId) {
                await this.updateGenre(genreId, formData);
            } else {
                await this.addGenre(formData);
            }
        });
    }
}

window.genresManager = new GenresManager();
document.addEventListener('DOMContentLoaded', () => {
    window.genresManager.loadGenres();
}); 