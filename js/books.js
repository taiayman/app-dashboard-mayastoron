import { db, formatDate, handleError } from './config.js';
import { 
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc,
    orderBy, onSnapshot, serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

class BooksManager {
    constructor() {
        this.booksRef = collection(db, 'books');
        this.genresRef = collection(db, 'academic_genres');
        this.filters = {
            search: '',
            genre: '',
            type: '',
            sort: 'title'
        };
        this.availableGenres = [];
        this.selectedGenres = new Set();
        this.loadGenres();
        this.setupEventListeners();
        this.setupRealtimeListener();
    }

    async loadGenres() {
        try {
            const snapshot = await getDocs(query(this.genresRef, orderBy('name')));
            const genreFilter = document.getElementById('genre-filter');
            const genreSelect = document.getElementById('book-genres');
            
            this.availableGenres = [];
            snapshot.forEach(doc => {
                const genre = doc.data();
                this.availableGenres.push(genre.name);
            });

            this.availableGenres.sort();

            // Update filter dropdown
            genreFilter.innerHTML = '<option value="">All Genres</option>' +
                this.availableGenres.map(genre => `<option value="${genre}">${genre}</option>`).join('');

            // Update hidden select for form submission
            genreSelect.innerHTML = this.availableGenres.map(genre => 
                `<option value="${genre}">${genre}</option>`
            ).join('');

            // Initialize genre options
            this.updateGenreOptions();
        } catch (error) {
            handleError(error);
        }
    }

    updateGenreOptions(searchTerm = '') {
        const genreOptions = document.getElementById('genre-options');
        const filteredGenres = searchTerm 
            ? this.availableGenres.filter(genre => 
                genre.toLowerCase().includes(searchTerm.toLowerCase()) &&
                !this.selectedGenres.has(genre)
              )
            : this.availableGenres.filter(genre => !this.selectedGenres.has(genre));

        genreOptions.innerHTML = filteredGenres.length 
            ? filteredGenres.map(genre => `
                <div class="genre-option px-3 py-2 hover:bg-orange-50 cursor-pointer rounded text-sm"
                     data-genre="${genre}">
                    ${genre}
                </div>
              `).join('')
            : '<div class="px-3 py-2 text-gray-500 text-sm">No genres found</div>';

        // Add click handlers to new options
        genreOptions.querySelectorAll('.genre-option').forEach(option => {
            option.addEventListener('click', () => this.addGenre(option.dataset.genre));
        });
    }

    updateSelectedGenres() {
        const selectedGenresContainer = document.getElementById('selected-genres');
        const genreSelect = document.getElementById('book-genres');
        
        selectedGenresContainer.innerHTML = Array.from(this.selectedGenres).map(genre => `
            <span class="inline-flex items-center bg-orange-100 text-orange-800 text-sm px-2 py-1 rounded-full">
                ${genre}
                <button type="button" class="ml-1 text-orange-600 hover:text-orange-800" data-genre="${genre}">
                    <i class="fas fa-times"></i>
                </button>
            </span>
        `).join('');

        // Update hidden select values
        Array.from(genreSelect.options).forEach(option => {
            option.selected = this.selectedGenres.has(option.value);
        });

        // Add click handlers to remove buttons
        selectedGenresContainer.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', () => this.removeGenre(button.dataset.genre));
        });
    }

    addGenre(genre) {
        this.selectedGenres.add(genre);
        this.updateSelectedGenres();
        this.updateGenreOptions(document.getElementById('genre-search').value);
        document.getElementById('genre-search').value = '';
        document.getElementById('genre-dropdown').classList.add('hidden');
    }

    removeGenre(genre) {
        this.selectedGenres.delete(genre);
        this.updateSelectedGenres();
        this.updateGenreOptions(document.getElementById('genre-search').value);
    }

    setupGenreSearch() {
        const searchInput = document.getElementById('genre-search');
        const dropdown = document.getElementById('genre-dropdown');
        
        searchInput.addEventListener('focus', () => {
            dropdown.classList.remove('hidden');
            this.updateGenreOptions(searchInput.value);
        });

        searchInput.addEventListener('input', (e) => {
            this.updateGenreOptions(e.target.value);
            dropdown.classList.remove('hidden');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.genre-option') && 
                !e.target.closest('#genre-search') && 
                !e.target.closest('#selected-genres')) {
                dropdown.classList.add('hidden');
            }
        });
    }

    async loadBooks() {
        try {
            let q = query(this.booksRef);

            if (this.filters.search) {
                const searchLower = this.filters.search.toLowerCase();
                q = query(q, where('title', '>=', searchLower), 
                            where('title', '<=', searchLower + '\uf8ff'));
            }
            if (this.filters.genre) {
                q = query(q, where('genres', 'array-contains', this.filters.genre));
            }
            if (this.filters.type) {
                q = query(q, where('isPremium', '==', this.filters.type === 'premium'));
            }

            q = query(q, orderBy(this.filters.sort));

            const snapshot = await getDocs(q);
            const booksGrid = document.getElementById('books-grid');
            const booksTableBody = document.getElementById('books-table-body');
            booksGrid.innerHTML = '';
            booksTableBody.innerHTML = '';

            if (snapshot.empty) {
                const emptyMessage = `
                    <div class="col-span-full text-center py-8 text-gray-500">
                        No books found
                    </div>`;
                booksGrid.innerHTML = emptyMessage;
                booksTableBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-4 py-8 text-center text-gray-500">
                            No books found
                        </td>
                    </tr>`;
                return;
            }

            snapshot.forEach(doc => {
                const book = doc.data();
                booksGrid.innerHTML += this.createBookCard(doc.id, book);
                booksTableBody.innerHTML += this.createBookListItem(doc.id, book);
            });
        } catch (error) {
            console.error('Error loading books:', error);
        }
    }

    createBookCard(bookId, book) {
        const releaseDate = book.releaseDate ? new Date(book.releaseDate).toLocaleDateString() : 'N/A';
        
        return `
            <div class="group relative" data-book-id="${bookId}">
                <div class="transform-gpu transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-xl bg-white rounded-xl overflow-hidden">
                    <div class="relative h-48 sm:h-64">
                        <img src="${book.imageUrl || 'https://via.placeholder.com/300x400?text=No+Cover'}" 
                             alt="${book.title}" 
                             class="w-full h-full object-cover"
                             onerror="this.src='https://via.placeholder.com/300x400?text=Error+Loading+Cover'">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                        ${book.featured ? 
                            `<span class="absolute top-2 right-2 px-2 py-1 bg-yellow-400 text-xs font-bold rounded-full">
                                FEATURED
                            </span>` : ''}
                        ${book.isPremium ? 
                            `<span class="absolute top-2 left-2 px-2 py-1 bg-purple-500 text-white text-xs font-bold rounded-full">
                                PREMIUM
                            </span>` : ''}
                        <div class="absolute bottom-0 left-0 right-0 p-4 text-white">
                            <h3 class="font-semibold text-lg leading-tight line-clamp-2">${book.title}</h3>
                            <p class="text-sm opacity-90">${book.author}</p>
                        </div>
                    </div>
                    
                    <div class="p-4">
                        <div class="flex items-center justify-between mb-2">
                            ${this.createRatingStars(book.rating)}
                            <span class="text-sm text-gray-600">${book.pageCount} pages</span>
                        </div>
                        <div class="flex flex-wrap gap-1 mb-3">
                            ${book.genres.map(genre => 
                                `<span class="px-2 py-0.5 bg-orange-100 text-orange-600 text-xs rounded-full">
                                    ${genre}
                                </span>`
                            ).join('')}
                        </div>
                        <div class="flex justify-between items-center pt-2 border-t border-gray-100">
                            <div class="flex space-x-2">
                                <button onclick="booksManager.editBook('${bookId}')" 
                                        class="p-2 text-orange-500 hover:text-orange-700 transition-colors">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="booksManager.deleteBook('${bookId}')"
                                        class="p-2 text-red-500 hover:text-red-700 transition-colors">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                            <button onclick="booksManager.viewBookDetails('${bookId}')"
                                    class="flex items-center text-orange-500 hover:text-orange-700 transition-colors">
                                <span class="text-sm mr-1">View</span>
                                <i class="fas fa-external-link-alt"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    createBookListItem(bookId, book) {
        return `
            <tr class="border-b hover:bg-gray-50" data-book-id="${bookId}">
                <td class="px-4 py-3">
                    <div class="flex items-center space-x-3">
                        <img src="${book.imageUrl || 'https://via.placeholder.com/40x60?text=No+Cover'}" 
                             alt="${book.title}"
                             class="w-10 h-15 object-cover rounded"
                             onerror="this.src='https://via.placeholder.com/40x60?text=Error'">
                        <div>
                            <div class="font-medium text-gray-900">${book.title}</div>
                            <div class="text-sm text-gray-500 line-clamp-1">
                                ${book.genres.map(genre => 
                                    `<span class="inline-block px-2 py-0.5 bg-orange-100 text-orange-600 text-xs rounded-full mr-1">
                                        ${genre}
                                    </span>`
                                ).join('')}
                            </div>
                        </div>
                    </div>
                </td>
                <td class="px-4 py-3 text-sm text-gray-900">${book.author}</td>
                <td class="px-4 py-3">
                    <div class="flex items-center">
                        ${this.createRatingStars(book.rating)}
                        <span class="ml-1 text-sm text-gray-600">${book.rating}</span>
                    </div>
                </td>
                <td class="px-4 py-3">
                    ${book.isPremium ? 
                        `<span class="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">Premium</span>` :
                        `<span class="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Free</span>`
                    }
                </td>
                <td class="px-4 py-3">
                    <div class="flex items-center space-x-2">
                        <button onclick="booksManager.editBook('${bookId}')" 
                                class="p-2 text-orange-500 hover:text-orange-700 transition-colors">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="booksManager.deleteBook('${bookId}')"
                                class="p-2 text-red-500 hover:text-red-700 transition-colors">
                            <i class="fas fa-trash"></i>
                        </button>
                        <button onclick="booksManager.viewBookDetails('${bookId}')"
                                class="p-2 text-orange-500 hover:text-orange-700 transition-colors">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    createRatingStars(rating) {
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
        
        return `
            <div class="flex text-yellow-400">
                ${'<i class="fas fa-star"></i>'.repeat(fullStars)}
                ${hasHalfStar ? '<i class="fas fa-star-half-alt"></i>' : ''}
                ${'<i class="far fa-star"></i>'.repeat(emptyStars)}
            </div>
        `;
    }

    async addBook(formData) {
        try {
            const genreSelect = document.getElementById('book-genres');
            const selectedGenres = Array.from(genreSelect.selectedOptions).map(option => option.value);

            const newBook = {
                title: formData.get('title'),
                author: formData.get('author'),
                description: formData.get('description'),
                publisher: formData.get('publisher'),
                releaseDate: formData.get('releaseDate'),
                pageCount: parseInt(formData.get('pageCount')),
                rating: parseFloat(formData.get('rating')),
                genres: selectedGenres,
                isPremium: formData.get('isPremium') === 'on',
                featured: formData.get('featured') === 'on',
                imageUrl: formData.get('imageUrl'),
                pdfUrl: formData.get('pdfUrl'),
                created_at: serverTimestamp()
            };

            await addDoc(this.booksRef, newBook);
            this.closeModal();
            alert('Book added successfully!');
        } catch (error) {
            handleError(error);
        }
    }

    async editBook(bookId) {
        try {
            const bookDoc = await getDoc(doc(db, 'books', bookId));
            if (!bookDoc.exists()) {
                throw new Error('Book not found');
            }
            const book = bookDoc.data();
            
            const modal = document.getElementById('book-modal');
            const form = modal.querySelector('#book-form');
            form.dataset.bookId = bookId;
            
            document.getElementById('modal-title').textContent = 'Edit Book';
            document.getElementById('book-title').value = book.title;
            document.getElementById('book-author').value = book.author;
            document.getElementById('book-description').value = book.description;
            document.getElementById('book-publisher').value = book.publisher;
            document.getElementById('book-release-date').value = book.releaseDate;
            document.getElementById('book-page-count').value = book.pageCount;
            document.getElementById('book-rating').value = book.rating;
            document.getElementById('book-premium').checked = book.isPremium;
            document.getElementById('book-featured').checked = book.featured;
            document.getElementById('book-image-url').value = book.imageUrl || '';
            document.getElementById('book-pdf-url').value = book.pdfUrl || '';

            // Update selected genres
            this.selectedGenres = new Set(book.genres);
            this.updateSelectedGenres();
            this.updateGenreOptions();
            
            const imagePreview = document.getElementById('image-preview');
            if (book.imageUrl) {
                imagePreview.src = book.imageUrl;
                imagePreview.classList.remove('hidden');
            } else {
                imagePreview.classList.add('hidden');
                imagePreview.src = '';
            }
            
            modal.classList.remove('hidden');
        } catch (error) {
            handleError(error);
        }
    }

    async updateBook(bookId, formData) {
        try {
            const updateData = {
                title: formData.get('title'),
                author: formData.get('author'),
                description: formData.get('description'),
                publisher: formData.get('publisher'),
                releaseDate: formData.get('releaseDate'),
                pageCount: parseInt(formData.get('pageCount')),
                rating: parseFloat(formData.get('rating')),
                isPremium: formData.get('isPremium') === 'on',
                featured: formData.get('featured') === 'on',
                imageUrl: formData.get('imageUrl'),
                pdfUrl: formData.get('pdfUrl')
            };

            const genreSelect = document.getElementById('book-genres');
            updateData.genres = Array.from(genreSelect.selectedOptions).map(option => option.value);

            await updateDoc(doc(db, 'books', bookId), updateData);
            this.closeModal();
            alert('Book updated successfully!');
        } catch (error) {
            handleError(error);
        }
    }

    async deleteBook(bookId) {
        if (confirm('Are you sure you want to delete this book?')) {
            try {
                await deleteDoc(doc(db, 'books', bookId));
                alert('Book deleted successfully!');
            } catch (error) {
                handleError(error);
            }
        }
    }

    async viewBookDetails(bookId) {
        try {
            const bookDoc = await getDoc(doc(db, 'books', bookId));
            if (!bookDoc.exists()) {
                throw new Error('Book not found');
            }
            const book = bookDoc.data();
            
            window.open(book.pdfUrl, '_blank');
        } catch (error) {
            handleError(error);
        }
    }

    setupRealtimeListener() {
        const q = query(this.booksRef, orderBy(this.filters.sort));
        onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const bookId = change.doc.id;
                const book = change.doc.data();
                const bookElement = document.querySelector(`[data-book-id="${bookId}"]`);

                if (change.type === 'added' && !bookElement) {
                    const booksGrid = document.getElementById('books-grid');
                    booksGrid.insertAdjacentHTML('beforeend', this.createBookCard(bookId, book));
                } else if (change.type === 'modified' && bookElement) {
                    bookElement.outerHTML = this.createBookCard(bookId, book);
                } else if (change.type === 'removed' && bookElement) {
                    bookElement.remove();
                }
            });
        });
    }

    closeModal() {
        const modal = document.getElementById('book-modal');
        const form = modal.querySelector('#book-form');
        form.reset();
        delete form.dataset.bookId;
        document.getElementById('modal-title').textContent = 'Add New Book';
        
        document.getElementById('image-preview').classList.add('hidden');
        document.getElementById('image-preview').src = '';
        
        // Clear selected genres
        this.selectedGenres.clear();
        this.updateSelectedGenres();
        this.updateGenreOptions();
        
        const stars = document.querySelectorAll('#book-rating + div i');
        stars.forEach(star => star.className = 'far fa-star');
        
        modal.classList.add('hidden');
    }

    setupEventListeners() {
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.filters.search = e.target.value.toLowerCase();
            this.loadBooks();
        });

        document.getElementById('genre-filter').addEventListener('change', (e) => {
            this.filters.genre = e.target.value;
            this.loadBooks();
        });

        document.getElementById('type-filter').addEventListener('change', (e) => {
            this.filters.type = e.target.value;
            this.loadBooks();
        });

        document.getElementById('sort-select').addEventListener('change', (e) => {
            this.filters.sort = e.target.value;
            this.loadBooks();
        });

        document.getElementById('add-book-btn').addEventListener('click', () => {
            document.getElementById('book-modal').classList.remove('hidden');
        });

        document.getElementById('close-modal').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('cancel-modal').addEventListener('click', () => {
            this.closeModal();
        });

        // Preview image when URL is entered
        document.getElementById('book-image-url').addEventListener('input', (e) => {
            const imageUrl = e.target.value;
            const preview = document.getElementById('image-preview');
            
            if (imageUrl && this.isValidUrl(imageUrl)) {
                preview.src = imageUrl;
                preview.classList.remove('hidden');
                preview.onerror = () => {
                    preview.classList.add('hidden');
                    preview.src = '';
                };
            } else {
                preview.classList.add('hidden');
                preview.src = '';
            }
        });

        const ratingInput = document.getElementById('book-rating');
        const updateStars = (rating) => {
            const stars = ratingInput.nextElementSibling.querySelectorAll('i');
            stars.forEach((star, index) => {
                if (index < Math.floor(rating)) {
                    star.className = 'fas fa-star';
                } else if (index === Math.floor(rating) && rating % 1 >= 0.5) {
                    star.className = 'fas fa-star-half-alt';
                } else {
                    star.className = 'far fa-star';
                }
            });
        };

        ratingInput.addEventListener('input', (e) => {
            const rating = parseFloat(e.target.value);
            if (rating >= 0 && rating <= 5) {
                updateStars(rating);
            }
        });

        document.getElementById('book-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const bookId = e.target.dataset.bookId;
            const formData = new FormData(e.target);

            if (bookId) {
                await this.updateBook(bookId, formData);
            } else {
                await this.addBook(formData);
            }
        });

        // Setup genre search functionality
        this.setupGenreSearch();
    }

    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }
}

window.booksManager = new BooksManager();
document.addEventListener('DOMContentLoaded', () => {
    window.booksManager.loadBooks();
});