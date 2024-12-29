import { db, formatDate } from './config.js';
import { 
    collection, query, where, getDocs, onSnapshot,
    orderBy, limit, startAfter, Timestamp 
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

class DashboardManager {
    constructor() {
        this.usersRef = collection(db, 'users');
        this.booksRef = collection(db, 'books');
        this.readingStatesRef = collection(db, 'reading_states');
        this.setupRealtimeListeners();
        this.initializeCharts();
        this.loadDashboardData();
    }

    async loadDashboardData() {
        await Promise.all([
            this.loadStats(),
            this.loadRecentActivity(),
            this.loadTopBooks(),
            this.updateCharts()
        ]);
    }

    async loadStats() {
        try {
            // Get current month's start and end
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            
            // Get last month's start
            const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

            // Total Users
            const [currentUsers, lastMonthUsers] = await Promise.all([
                getDocs(query(this.usersRef, where('created_at', '>=', Timestamp.fromDate(monthStart)))),
                getDocs(query(this.usersRef, where('created_at', '>=', Timestamp.fromDate(lastMonthStart)), 
                                           where('created_at', '<', Timestamp.fromDate(monthStart))))
            ]);
            
            const totalUsers = (await getDocs(this.usersRef)).size;
            const usersGrowth = ((currentUsers.size - lastMonthUsers.size) / lastMonthUsers.size * 100).toFixed(1);
            
            document.getElementById('total-users').textContent = totalUsers;
            document.getElementById('users-growth').textContent = `${usersGrowth}%`;

            // Total Books
            const [currentBooks, lastMonthBooks] = await Promise.all([
                getDocs(query(this.booksRef, where('created_at', '>=', Timestamp.fromDate(monthStart)))),
                getDocs(query(this.booksRef, where('created_at', '>=', Timestamp.fromDate(lastMonthStart)),
                                           where('created_at', '<', Timestamp.fromDate(monthStart))))
            ]);
            
            const totalBooks = (await getDocs(this.booksRef)).size;
            const booksGrowth = ((currentBooks.size - lastMonthBooks.size) / lastMonthBooks.size * 100).toFixed(1);
            
            document.getElementById('total-books').textContent = totalBooks;
            document.getElementById('books-growth').textContent = `${booksGrowth}%`;

            // Active Readers
            const [currentReaders, lastMonthReaders] = await Promise.all([
                getDocs(query(this.readingStatesRef, where('lastReadAt', '>=', Timestamp.fromDate(monthStart)))),
                getDocs(query(this.readingStatesRef, where('lastReadAt', '>=', Timestamp.fromDate(lastMonthStart)),
                                                    where('lastReadAt', '<', Timestamp.fromDate(monthStart))))
            ]);
            
            const activeReaders = currentReaders.size;
            const readersGrowth = ((currentReaders.size - lastMonthReaders.size) / lastMonthReaders.size * 100).toFixed(1);
            
            document.getElementById('active-readers').textContent = activeReaders;
            document.getElementById('readers-growth').textContent = `${readersGrowth}%`;

            // Premium Users
            const [currentPremium, lastMonthPremium] = await Promise.all([
                getDocs(query(this.usersRef, where('isPremium', '==', true),
                                           where('created_at', '>=', Timestamp.fromDate(monthStart)))),
                getDocs(query(this.usersRef, where('isPremium', '==', true),
                                           where('created_at', '>=', Timestamp.fromDate(lastMonthStart)),
                                           where('created_at', '<', Timestamp.fromDate(monthStart))))
            ]);
            
            const totalPremium = (await getDocs(query(this.usersRef, where('isPremium', '==', true)))).size;
            const premiumGrowth = ((currentPremium.size - lastMonthPremium.size) / lastMonthPremium.size * 100).toFixed(1);
            
            document.getElementById('premium-users').textContent = totalPremium;
            document.getElementById('premium-growth').textContent = `${premiumGrowth}%`;

        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async loadRecentActivity() {
        try {
            const snapshot = await getDocs(query(
                this.readingStatesRef,
                orderBy('lastReadAt', 'desc'),
                limit(5)
            ));

            const activityContainer = document.getElementById('recent-activity');
            activityContainer.innerHTML = '';

            for (const doc of snapshot.docs) {
                const activity = doc.data();
                const [user, book] = await Promise.all([
                    getDocs(query(this.usersRef, where('uid', '==', activity.userId))),
                    getDocs(query(this.booksRef, where('id', '==', activity.bookId)))
                ]);

                const userData = user.docs[0]?.data() || { displayName: 'Unknown User' };
                const bookData = book.docs[0]?.data() || { title: 'Unknown Book' };

                activityContainer.innerHTML += `
                    <div class="flex items-center space-x-4">
                        <div class="flex-shrink-0">
                            <img src="${userData.photoURL || 'https://via.placeholder.com/40'}" 
                                 alt="${userData.displayName}"
                                 class="w-10 h-10 rounded-full">
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-gray-900 truncate">
                                ${userData.displayName}
                            </p>
                            <p class="text-sm text-gray-500">
                                Reading <span class="font-medium text-orange-600">${bookData.title}</span>
                            </p>
                        </div>
                        <div class="text-sm text-gray-400">
                            ${formatDate(activity.lastReadAt.toDate())}
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading recent activity:', error);
        }
    }

    async loadTopBooks() {
        try {
            const snapshot = await getDocs(query(
                this.booksRef,
                orderBy('rating', 'desc'),
                limit(5)
            ));

            const booksContainer = document.getElementById('top-books');
            booksContainer.innerHTML = '';

            snapshot.forEach(doc => {
                const book = doc.data();
                booksContainer.innerHTML += `
                    <div class="flex items-center space-x-4">
                        <div class="flex-shrink-0">
                            <img src="${book.imageUrl || 'https://via.placeholder.com/40'}" 
                                 alt="${book.title}"
                                 class="w-16 h-20 object-cover rounded-lg shadow">
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-gray-900 truncate">
                                ${book.title}
                            </p>
                            <p class="text-sm text-gray-500">
                                by ${book.author}
                            </p>
                            <div class="flex items-center mt-1">
                                ${this.createRatingStars(book.rating)}
                                <span class="ml-1 text-sm text-gray-500">${book.rating}</span>
                            </div>
                        </div>
                        <div class="text-sm font-medium text-orange-600">
                            ${book.pageCount} pages
                        </div>
                    </div>
                `;
            });
        } catch (error) {
            console.error('Error loading top books:', error);
        }
    }

    createRatingStars(rating) {
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
        
        return `
            <div class="flex text-yellow-400 text-sm">
                ${'<i class="fas fa-star"></i>'.repeat(fullStars)}
                ${hasHalfStar ? '<i class="fas fa-star-half-alt"></i>' : ''}
                ${'<i class="far fa-star"></i>'.repeat(emptyStars)}
            </div>
        `;
    }

    async updateCharts() {
        await Promise.all([
            this.updateUserActivityChart(),
            this.updateGenresChart()
        ]);
    }

    async updateUserActivityChart() {
        try {
            const days = 7;
            const data = new Array(days).fill(0);
            const labels = [];
            
            for (let i = days - 1; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
                
                const startOfDay = new Date(date.setHours(0, 0, 0, 0));
                const endOfDay = new Date(date.setHours(23, 59, 59, 999));
                
                const snapshot = await getDocs(query(
                    this.readingStatesRef,
                    where('lastReadAt', '>=', Timestamp.fromDate(startOfDay)),
                    where('lastReadAt', '<=', Timestamp.fromDate(endOfDay))
                ));
                
                data[days - 1 - i] = snapshot.size;
            }

            const ctx = document.getElementById('user-activity-chart').getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Active Users',
                        data: data,
                        borderColor: '#f97316',
                        backgroundColor: 'rgba(249, 115, 22, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                display: false
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error updating user activity chart:', error);
        }
    }

    async updateGenresChart() {
        try {
            const genreCounts = {};
            const snapshot = await getDocs(this.booksRef);
            
            snapshot.forEach(doc => {
                const book = doc.data();
                book.genres.forEach(genre => {
                    genreCounts[genre] = (genreCounts[genre] || 0) + 1;
                });
            });

            const sortedGenres = Object.entries(genreCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            const ctx = document.getElementById('genres-chart').getContext('2d');
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: sortedGenres.map(([genre]) => genre),
                    datasets: [{
                        data: sortedGenres.map(([, count]) => count),
                        backgroundColor: [
                            '#f97316',
                            '#fb923c',
                            '#fdba74',
                            '#fed7aa',
                            '#ffedd5'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'right'
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error updating genres chart:', error);
        }
    }

    setupRealtimeListeners() {
        // Listen for changes in reading states
        onSnapshot(query(this.readingStatesRef, orderBy('lastReadAt', 'desc'), limit(5)), 
            () => this.loadRecentActivity());

        // Listen for changes in books
        onSnapshot(query(this.booksRef, orderBy('rating', 'desc'), limit(5)),
            () => this.loadTopBooks());

        // Update stats every minute
        setInterval(() => this.loadStats(), 60000);

        // Update charts every 5 minutes
        setInterval(() => this.updateCharts(), 300000);
    }
}

window.dashboardManager = new DashboardManager(); 