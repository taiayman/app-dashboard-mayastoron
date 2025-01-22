import { db, formatDate, handleError } from './config.js';
import { 
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc,
    orderBy, onSnapshot, serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

class BooksManager {
    constructor() {
        this.booksRef = collection(db, 'books');
        this.genresRef = collection(db, 'academic_genres');
        
        // GitHub configuration
        this.GITHUB_TOKEN = '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';
        this.REPO_OWNER = 'taiayman';
        this.REPO_NAME = 'pdf-storage';
        this.BRANCH = 'main';
        
        // Default images
        this.defaultBookCover = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNGM0Y0RjYiLz48cGF0aCBkPSJNMTUwIDEwMEMxNzMuMDkgMTAwIDE5MiA4MS4wOSAxOTIgNThDMTkyIDM0LjkxIDE3My4wOSAxNiAxNTAgMTZDMTI2LjkxIDE2IDEwOCAzNC45MSAxMDggNThDMTA4IDgxLjA5IDEyNi45MSAxMDAgMTUwIDEwMFoiIGZpbGw9IiNEMUQ1REIiLz48dGV4dCB4PSIxNTAiIHk9IjE0MCIgdGV4dD0iYW5jaG9yIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjI0IiBmb250LWZhbWlseT0ic3lzdGVtLXVpLCBzYW5zLXNlcmlmIiBmaWxsPSIjNkI3MjgwIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
        
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

    async uploadToGitHub(file, type = 'pdf') {
        try {
            const content = await this.readFileAsBase64(file);
            const timestamp = Date.now();
            const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            
            // Determine the correct path based on file type
            let path;
            if (type === 'image') {
                path = `images/${timestamp}_${sanitizedName}`; // Use images directory for images
            } else {
                path = `pdfs/${timestamp}_${sanitizedName}`; // Use pdfs directory for PDFs
            }
            
            console.log(`Uploading ${type} to GitHub:`, {
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
                    message: `Upload ${type}: ${file.name}`,
                    content: content,
                    branch: this.BRANCH
                })
            });

            const responseData = await response.json();
            
            if (!response.ok) {
                console.error('GitHub API Error Response:', responseData);
                throw new Error(`Failed to upload ${type} to GitHub: ${responseData.message}`);
            }

            // Convert GitHub raw URL to jsDelivr CDN URL
            const cdnUrl = `https://cdn.jsdelivr.net/gh/${this.REPO_OWNER}/${this.REPO_NAME}@${this.BRANCH}/${path}`;
            console.log(`Successfully uploaded ${type}. CDN URL:`, cdnUrl);
            
            return {
                url: cdnUrl,
                path: path
            };
        } catch (error) {
            console.error(`GitHub ${type} upload error:`, error);
            // Add more detailed error information
            const errorMessage = error.response ? 
                `${error.message} (Status: ${error.response.status})` : 
                error.message;
            throw new Error(`Failed to upload ${type} to GitHub: ${errorMessage}`);
        }
    }

    showLoading(container, type) {
        container.innerHTML = `
            <div class="flex items-center justify-center p-4">
                <div class="flex items-center gap-3">
                    <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500"></div>
                    <span class="text-sm text-gray-700">Uploading ${type}...</span>
                </div>
            </div>
        `;
    }

    resetImageUpload() {
        const imagePreviewContainer = document.getElementById('image-preview-container');
        const imageInput = document.getElementById('book-cover-upload');
        const imageUrlInput = document.getElementById('book-cover-url');

        imagePreviewContainer.innerHTML = `
            <div id="image-upload-prompt" class="text-center">
                <i class="fas fa-cloud-upload-alt text-4xl text-orange-400 mb-2"></i>
                <p class="text-sm text-gray-600">Drag and drop an image here, or</p>
                <button type="button" onclick="document.getElementById('book-cover-upload').click()" 
                        class="mt-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors">
                    Choose Image
                </button>
            </div>
        `;

        imageInput.value = '';
        imageUrlInput.value = '';
    }

    resetPdfUpload() {
        const pdfPreviewContainer = document.getElementById('pdf-preview-container');
        const pdfInput = document.getElementById('book-pdf-upload');
        const pdfUrlInput = document.getElementById('book-pdf-url');

        pdfPreviewContainer.innerHTML = `
            <div id="pdf-upload-prompt" class="text-center">
                <i class="fas fa-file-pdf text-4xl text-orange-400 mb-2"></i>
                <p class="text-sm text-gray-600">Drag and drop a PDF here, or</p>
                <button type="button" onclick="document.getElementById('book-pdf-upload').click()" 
                        class="mt-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors">
                    Choose PDF
                </button>
            </div>
        `;

        pdfInput.value = '';
        pdfUrlInput.value = '';
    }

    async loadGenres() {
        try {
            const snapshot = await getDocs(query(this.genresRef, orderBy('name')));
            const genreSelect = document.getElementById('book-genres');
            
            this.availableGenres = [];
            snapshot.forEach(doc => {
                const genre = doc.data();
                this.availableGenres.push(genre.name);
            });

            this.availableGenres.sort();

            // Update hidden select for form submission
            if (genreSelect) {
                genreSelect.innerHTML = this.availableGenres.map(genre => 
                    `<option value="${genre}">${genre}</option>`
                ).join('');
            }

            // Initialize genre options
            this.updateGenreOptions();
        } catch (error) {
            console.error('Error loading genres:', error);
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
        return `
            <div class="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div class="relative aspect-[3/4] overflow-hidden bg-gray-100">
                    <img src="${book.coverUrl || book.imageUrl}" 
                         alt="${book.title}" 
                         class="w-full h-full object-cover transition-transform hover:scale-105"
                         onerror="this.src='${this.defaultBookCover}'">
                    ${book.isPremium ? `
                        <div class="absolute top-2 right-2">
                            <span class="bg-orange-500 text-white text-xs px-2 py-1 rounded-full">
                                <i class="fas fa-crown mr-1"></i>Premium
                            </span>
                        </div>
                    ` : ''}
                </div>
                
                <div class="p-4">
                    <div class="flex items-start justify-between gap-2">
                        <h3 class="font-semibold text-gray-800 line-clamp-2">${book.title}</h3>
                        <div class="flex gap-1 text-sm">
                            ${this.createRatingStars(book.rating)}
                        </div>
                    </div>
                    
                    <p class="text-sm text-gray-600 mt-1">${book.author}</p>
                    
                    <div class="mt-2 flex flex-wrap gap-1">
                        ${book.genres.slice(0, 2).map(genre => `
                            <span class="inline-block bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">
                                ${genre}
                            </span>
                        `).join('')}
                        ${book.genres.length > 2 ? `
                            <span class="inline-block bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">
                                +${book.genres.length - 2}
                            </span>
                        ` : ''}
                    </div>
                    
                    <div class="mt-3 text-xs text-gray-500 flex items-center gap-3">
                        <span class="flex items-center gap-1">
                            <i class="fas fa-book"></i>
                            ${book.pageCount} pages
                        </span>
                        <span class="flex items-center gap-1">
                            <i class="fas fa-calendar"></i>
                            ${book.releaseDate ? new Date(book.releaseDate).getFullYear() : 'N/A'}
                        </span>
                        <span class="flex items-center gap-1">
                            <i class="fas fa-globe"></i>
                            ${book.language.toUpperCase()}
                        </span>
                    </div>
                    
                    <div class="mt-4 flex items-center justify-between gap-2">
                        <button onclick="booksManager.viewBookDetails('${bookId}')" 
                                class="flex-1 bg-orange-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-orange-600 transition-colors">
                            View Details
                        </button>
                        <div class="flex gap-1">
                            <button onclick="booksManager.editBook('${bookId}')"
                                    class="p-1.5 text-gray-500 hover:text-orange-500 transition-colors">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="booksManager.deleteBook('${bookId}')"
                                    class="p-1.5 text-gray-500 hover:text-red-500 transition-colors">
                                <i class="fas fa-trash"></i>
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
                        <img src="${book.coverUrl || book.imageUrl || this.defaultBookCover}" 
                             alt="${book.title}"
                             class="w-10 h-15 object-cover rounded"
                             onerror="this.src='${this.defaultBookCover}'">
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
            const bookData = {
                title: formData.get('title'),
                author: formData.get('author'),
                description: formData.get('description'),
                coverUrl: formData.get('coverUrl'),
                imageUrl: formData.get('imageUrl'),
                pdfUrl: formData.get('pdfUrl'),
                genres: Array.from(formData.getAll('genres')),
                language: formData.get('language'),
                pageCount: parseInt(formData.get('pages')) || 0,
                pages: 0,
                publisher: formData.get('publisher'),
                rating: parseFloat(formData.get('rating')) || 0,
                releaseDate: formData.get('releaseDate'),
                isPremium: formData.get('isPremium') === 'true',
                featured: false,
                created_at: serverTimestamp()
            };

            await addDoc(this.booksRef, bookData);
            this.closeModal();
        } catch (error) {
            handleError('Error adding book', error);
        }
    }

    async editBook(bookId) {
        try {
            const bookDoc = await getDoc(doc(this.booksRef, bookId));
            if (!bookDoc.exists()) {
                throw new Error('Book not found');
            }
            const book = bookDoc.data();
            
            const modal = document.getElementById('book-modal');
            const form = modal.querySelector('#book-form');
            form.dataset.bookId = bookId;
            
            // Update modal title
            document.getElementById('modal-title').textContent = 'Edit Book';

            // Set form field values
            const fields = {
                'book-title': book.title || '',
                'book-author': book.author || '',
                'book-description': book.description || '',
                'book-language': book.language || '',
                'book-publisher': book.publisher || '',
                'book-release-date': book.releaseDate || '',
                'book-pages': book.pageCount || 0,
                'book-rating': book.rating || 0,
                'book-premium': book.isPremium ? 'true' : 'false'
            };

            // Update form fields
            Object.entries(fields).forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) {
                    element.value = value;
                }
            });
            
            // Reset uploads
            this.resetImageUpload();
            this.resetPdfUpload();
            
            // Handle cover preview if exists
            if (book.coverUrl || book.imageUrl) {
                const imagePreviewContainer = document.getElementById('image-preview-container');
                if (imagePreviewContainer) {
                    imagePreviewContainer.innerHTML = `
                        <div id="image-upload-prompt" class="text-center">
                            <i class="fas fa-cloud-upload-alt text-4xl text-orange-400 mb-2"></i>
                            <p class="text-sm text-gray-600">Drag and drop an image here, or</p>
                            <button type="button" onclick="document.getElementById('book-cover-upload').click()" 
                                    class="mt-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors">
                                Choose Image
                            </button>
                            <div class="mt-4">
                                <img src="${book.coverUrl || book.imageUrl}" alt="" class="mx-auto max-h-48 rounded-lg border-2 border-gray-200">
                            </div>
                        </div>
                    `;
                }
                const coverUrlInput = document.getElementById('book-cover-url');
                const imageUrlInput = document.getElementById('book-image-url');
                if (coverUrlInput) coverUrlInput.value = book.coverUrl || '';
                if (imageUrlInput) imageUrlInput.value = book.imageUrl || '';
            }
            
            // Handle PDF preview if exists
            if (book.pdfUrl) {
                const pdfPreviewContainer = document.getElementById('pdf-preview-container');
                if (pdfPreviewContainer) {
                    pdfPreviewContainer.innerHTML = `
                        <div id="pdf-upload-prompt" class="text-center">
                            <i class="fas fa-file-pdf text-4xl text-orange-400 mb-2"></i>
                            <p class="text-sm text-gray-600">Drag and drop a PDF here, or</p>
                            <button type="button" onclick="document.getElementById('book-pdf-upload').click()" 
                                    class="mt-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors">
                                Choose PDF
                            </button>
                            <div class="mt-4 flex items-center justify-center gap-2 text-sm text-gray-600">
                                <i class="fas fa-check-circle text-green-500"></i>
                                PDF already uploaded
                            </div>
                        </div>
                    `;
                }
                const pdfUrlInput = document.getElementById('book-pdf-url');
                if (pdfUrlInput) pdfUrlInput.value = book.pdfUrl;
            }
            
            // Reset and update genres
            this.selectedGenres.clear();
            if (book.genres && Array.isArray(book.genres)) {
                book.genres.forEach(genre => this.selectedGenres.add(genre));
            }
            this.updateGenreOptions();
            this.updateSelectedGenres();
            
            // Show modal
            modal.classList.remove('hidden');
        } catch (error) {
            console.error('Error loading book:', error);
            handleError('Error loading book', error);
        }
    }

    async updateBook(bookId, formData) {
        try {
            const bookRef = doc(this.booksRef, bookId);
            const bookData = {
                title: formData.get('title'),
                author: formData.get('author'),
                description: formData.get('description'),
                coverUrl: formData.get('coverUrl'),
                imageUrl: formData.get('imageUrl'),
                pdfUrl: formData.get('pdfUrl'),
                genres: Array.from(formData.getAll('genres')),
                language: formData.get('language'),
                pageCount: parseInt(formData.get('pages')) || 0,
                pages: 0,
                publisher: formData.get('publisher'),
                rating: parseFloat(formData.get('rating')) || 0,
                releaseDate: formData.get('releaseDate'),
                isPremium: formData.get('isPremium') === 'true',
                featured: false
            };

            await updateDoc(bookRef, bookData);
            this.closeModal();
        } catch (error) {
            handleError('Error updating book', error);
        }
    }

    async deleteBook(bookId) {
        if (confirm('Are you sure you want to delete this book?')) {
            try {
                await deleteDoc(doc(this.booksRef, bookId));
                alert('Book deleted successfully!');
            } catch (error) {
                handleError(error);
            }
        }
    }

    async viewBookDetails(bookId) {
        try {
            const bookDoc = await getDoc(doc(this.booksRef, bookId));
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
        
        // Reset uploads
        this.resetImageUpload();
        this.resetPdfUpload();
        
        // Reset genres
        this.selectedGenres.clear();
        this.updateGenreOptions();
        
        modal.classList.add('hidden');
    }

    setupEventListeners() {
        // Search functionality
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.filters.search = e.target.value.toLowerCase();
            this.loadBooks();
        });

        // Genre filter
        document.getElementById('genre-filter').addEventListener('change', (e) => {
            this.filters.genre = e.target.value;
            this.loadBooks();
        });

        // Type filter
        document.getElementById('type-filter').addEventListener('change', (e) => {
            this.filters.type = e.target.value;
            this.loadBooks();
        });

        // Sort selection
        document.getElementById('sort-select').addEventListener('change', (e) => {
            this.filters.sort = e.target.value;
            this.loadBooks();
        });

        // Add book button
        document.getElementById('add-book-btn').addEventListener('click', () => {
            document.getElementById('book-modal').classList.remove('hidden');
        });

        // Close modal buttons
        const closeButtons = document.querySelectorAll('#close-modal');
        closeButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.closeModal();
            });
        });

        // Form submission
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

        // Image upload handling
        const imageInput = document.getElementById('book-cover-upload');
        const imagePreviewContainer = document.getElementById('image-preview-container');

        imageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.type.startsWith('image/')) {
                    if (file.size > 5 * 1024 * 1024) { // 5MB limit
                        alert('Image size must be less than 5 MB');
                        return;
                    }
                    try {
                        this.showLoading(imagePreviewContainer, 'image');
                        const { url } = await this.uploadToGitHub(file, 'image');
                        
                        imagePreviewContainer.innerHTML = `
                            <div id="image-upload-prompt" class="text-center">
                                <i class="fas fa-cloud-upload-alt text-4xl text-orange-400 mb-2"></i>
                                <p class="text-sm text-gray-600">Drag and drop an image here, or</p>
                                <button type="button" onclick="document.getElementById('book-cover-upload').click()" 
                                        class="mt-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors">
                                    Choose Image
                                </button>
                                <div class="mt-4">
                                    <img src="${url}" alt="" class="mx-auto max-h-48 rounded-lg border-2 border-gray-200">
                                </div>
                            </div>
                        `;
                        document.getElementById('book-cover-url').value = url;
                    } catch (error) {
                        console.error('Error uploading image:', error);
                        alert(error.message);
                        this.resetImageUpload();
                    }
                } else {
                    alert('Please select an image file.');
                    this.resetImageUpload();
                }
            }
        });

        // PDF upload handling
        const pdfInput = document.getElementById('book-pdf-upload');
        const pdfPreviewContainer = document.getElementById('pdf-preview-container');

        pdfInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.type === 'application/pdf') {
                    if (file.size > 50 * 1024 * 1024) { // 50MB limit
                        alert('PDF size must be less than 50 MB');
                        return;
                    }
                    try {
                        this.showLoading(pdfPreviewContainer, 'PDF');
                        const { url } = await this.uploadToGitHub(file, 'pdf');
                        
                        pdfPreviewContainer.innerHTML = `
                            <div id="pdf-upload-prompt" class="text-center">
                                <i class="fas fa-file-pdf text-4xl text-orange-400 mb-2"></i>
                                <p class="text-sm text-gray-600">Drag and drop a PDF here, or</p>
                                <button type="button" onclick="document.getElementById('book-pdf-upload').click()" 
                                        class="mt-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors">
                                    Choose PDF
                                </button>
                                <div class="mt-4 flex items-center justify-center gap-2 text-sm text-gray-600">
                                    <i class="fas fa-check-circle text-green-500"></i>
                                    PDF uploaded successfully
                                </div>
                            </div>
                        `;
                        document.getElementById('book-pdf-url').value = url;
                    } catch (error) {
                        console.error('Error uploading PDF:', error);
                        alert(error.message);
                        this.resetPdfUpload();
                    }
                } else {
                    alert('Please select a PDF file.');
                    this.resetPdfUpload();
                }
            }
        });

        // Drag and drop handling for images
        imagePreviewContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            imagePreviewContainer.classList.add('border-orange-500');
        });

        imagePreviewContainer.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            imagePreviewContainer.classList.remove('border-orange-500');
        });

        imagePreviewContainer.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            imagePreviewContainer.classList.remove('border-orange-500');

            const file = e.dataTransfer.files[0];
            if (file) {
                if (file.type.startsWith('image/')) {
                    imageInput.files = e.dataTransfer.files;
                    const event = new Event('change');
                    imageInput.dispatchEvent(event);
                } else {
                    alert('Please drop an image file.');
                }
            }
        });

        // Drag and drop handling for PDFs
        pdfPreviewContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            pdfPreviewContainer.classList.add('border-orange-500');
        });

        pdfPreviewContainer.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            pdfPreviewContainer.classList.remove('border-orange-500');
        });

        pdfPreviewContainer.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            pdfPreviewContainer.classList.remove('border-orange-500');

            const file = e.dataTransfer.files[0];
            if (file) {
                if (file.type === 'application/pdf') {
                    pdfInput.files = e.dataTransfer.files;
                    const event = new Event('change');
                    pdfInput.dispatchEvent(event);
                } else {
                    alert('Please drop a PDF file.');
                }
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
