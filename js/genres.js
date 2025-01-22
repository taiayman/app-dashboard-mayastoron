import { db } from './config.js';
import { 
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc,
    orderBy, onSnapshot, serverTimestamp, limit 
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

class GenresManager {
    constructor() {
        this.genresRef = collection(db, 'academic_genres');
        this.booksRef = collection(db, 'books');
        
        // GitHub configuration
        this.GITHUB_TOKEN = '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';
        this.REPO_OWNER = 'taiayman';
        this.REPO_NAME = 'pdf-storage';
        this.BRANCH = 'main';
        
        // Default image
        this.defaultGenreImage = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNGM0Y0RjYiLz48cGF0aCBkPSJNMTUwIDEwMEMxNzMuMDkgMTAwIDE5MiA4MS4wOSAxOTIgNThDMTkyIDM0LjkxIDE3My4wOSAxNiAxNTAgMTZDMTI2LjkxIDE2IDEwOCAzNC45MSAxMDggNThDMTA4IDgxLjA5IDEyNi45MSAxMDAgMTUwIDEwMFoiIGZpbGw9IiNEMUQ1REIiLz48dGV4dCB4PSIxNTAiIHk9IjE0MCIgdGV4dD0iYW5jaG9yIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjI0IiBmb250LWZhbWlseT0ic3lzdGVtLXVpLCBzYW5zLXNlcmlmIiBmaWxsPSIjNkI3MjgwIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
        
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
            const path = `images/${timestamp}_${sanitizedName}`;

            console.log('Uploading image to GitHub:', {
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
                    message: `Upload image: ${file.name}`,
                    content: content,
                    branch: this.BRANCH
                })
            });

            const responseData = await response.json();
            
            if (!response.ok) {
                console.error('GitHub API Error Response:', responseData);
                throw new Error(`Failed to upload image to GitHub: ${responseData.message}`);
            }

            // Use jsDelivr CDN URL for faster delivery
            const cdnUrl = `https://cdn.jsdelivr.net/gh/${this.REPO_OWNER}/${this.REPO_NAME}@${this.BRANCH}/${path}`;
            console.log('Successfully uploaded image. CDN URL:', cdnUrl);
            
            return cdnUrl;
        } catch (error) {
            console.error('GitHub image upload error:', error);
            throw error;
        }
    }

    showLoading(container) {
        container.innerHTML = `
            <div class="flex items-center justify-center p-4">
                <div class="flex items-center gap-3">
                    <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500"></div>
                    <span class="text-sm text-gray-700">Uploading image...</span>
                </div>
            </div>
        `;
    }

    resetImageUpload() {
        const imagePreviewContainer = document.getElementById('image-preview-container');
        const imageInput = document.getElementById('genre-image-upload');
        const imageUrlInput = document.getElementById('genre-image-url');

        imagePreviewContainer.innerHTML = `
            <div id="image-upload-prompt" class="text-center">
                <i class="fas fa-cloud-upload-alt text-4xl text-orange-400 mb-2"></i>
                <p class="text-sm text-gray-600">Drag and drop an image here, or</p>
                <button type="button" onclick="document.getElementById('genre-image-upload').click()" 
                        class="mt-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors">
                    Choose Image
                </button>
            </div>
        `;

        imageInput.value = '';
        imageUrlInput.value = '';
    }

    createGenreCard(genreId, genre) {
        return `
            <div class="bg-white rounded-xl shadow-sm overflow-hidden group hover:shadow-lg transition-shadow duration-300" 
                 data-genre-id="${genreId}">
                <div class="relative h-32">
                    <img src="${genre.imageUrl || this.defaultGenreImage}" 
                         alt="${genre.name}"
                         class="w-full h-full object-cover"
                         onerror="this.src='${this.defaultGenreImage}'">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    ${genre.featured ? `
                        <span class="absolute top-2 right-2 px-2 py-1 bg-yellow-400 text-xs font-bold rounded-full">
                            Featured
                        </span>
                    ` : ''}
                    <div class="absolute bottom-0 left-0 right-0 p-3">
                        <h3 class="font-semibold text-lg text-white">${genre.name}</h3>
                    </div>
                </div>
                <div class="p-4">
                    <div class="flex items-center space-x-3 mb-3">
                        <div class="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-xl">
                            ${this.getGenreIcon(genre.icon)}
                        </div>
                        <div class="flex-1">
                            <p class="text-sm text-gray-500">
                                <i class="fas fa-book mr-1"></i>
                                ${genre.bookCount || 0} books
                            </p>
                        </div>
                    </div>
                    <p class="text-sm text-gray-600 mb-4 line-clamp-2">
                        ${genre.description || 'No description available'}
                    </p>
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
                bookCount: 0,
                imageUrl: formData.get('imageUrl') || this.defaultGenreImage,
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
            const genreDoc = await getDoc(doc(this.genresRef, genreId));
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
            
            // Reset image upload
            this.resetImageUpload();
            
            // Handle image preview if exists
            if (genre.imageUrl && genre.imageUrl !== this.defaultGenreImage) {
                const imagePreviewContainer = document.getElementById('image-preview-container');
                imagePreviewContainer.innerHTML = `
                    <div id="image-upload-prompt" class="text-center">
                        <i class="fas fa-cloud-upload-alt text-4xl text-orange-400 mb-2"></i>
                        <p class="text-sm text-gray-600">Drag and drop an image here, or</p>
                        <button type="button" onclick="document.getElementById('genre-image-upload').click()" 
                                class="mt-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors">
                            Choose Image
                        </button>
                        <div class="mt-4">
                            <img src="${genre.imageUrl}" alt="" class="mx-auto max-h-48 rounded-lg border-2 border-gray-200">
                        </div>
                    </div>
                `;
                document.getElementById('genre-image-url').value = genre.imageUrl;
            }
            
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

            // Only update image URL if a new image was uploaded
            if (formData.get('imageUrl')) {
                updateData.imageUrl = formData.get('imageUrl');
            }

            await updateDoc(doc(this.genresRef, genreId), updateData);
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

                await deleteDoc(doc(this.genresRef, genreId));
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
        
        // Reset image upload
        this.resetImageUpload();
        
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

        // Image upload handling
        const imageInput = document.getElementById('genre-image-upload');
        const imagePreviewContainer = document.getElementById('image-preview-container');

        imageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.type.startsWith('image/')) {
                    try {
                        this.showLoading(imagePreviewContainer);
                        const url = await this.uploadToGitHub(file);
                        
                        imagePreviewContainer.innerHTML = `
                            <div id="image-upload-prompt" class="text-center">
                                <i class="fas fa-cloud-upload-alt text-4xl text-orange-400 mb-2"></i>
                                <p class="text-sm text-gray-600">Drag and drop an image here, or</p>
                                <button type="button" onclick="document.getElementById('genre-image-upload').click()" 
                                        class="mt-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors">
                                    Choose Image
                                </button>
                                <div class="mt-4">
                                    <img src="${url}" alt="" class="mx-auto max-h-48 rounded-lg border-2 border-gray-200">
                                </div>
                            </div>
                        `;
                        document.getElementById('genre-image-url').value = url;
                    } catch (error) {
                        alert(error.message);
                        this.resetImageUpload();
                    }
                } else {
                    alert('Please select an image file.');
                    this.resetImageUpload();
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
}

window.genresManager = new GenresManager();
document.addEventListener('DOMContentLoaded', () => {
    window.genresManager.loadGenres();
}); 
