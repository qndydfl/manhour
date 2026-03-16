// let manningChart = null;

// document.addEventListener('DOMContentLoaded', function () {
//     initManningChart();
//     initEventListeners();
// });

// function initManningChart() {
//     const ctx = document.getElementById('manningSummaryChart');
//     if (!ctx) return;

//     const getCount = (position) => {
//         const group = document.querySelector(`.area-group-label:contains('${position}')`);
//         return 0; 
//     };

//     const data = {
//         labels: ['LEFT SIDE', 'NONE', 'RIGHT SIDE'],
//         datasets: [{
//             label: '배정 인원수',
//             data: [12, 15, 10], 
//             backgroundColor: [
//                 'rgba(13, 110, 253, 0.8)', 
//                 'rgba(13, 202, 240, 0.8)', 
//                 'rgba(220, 53, 69, 0.8)'
//             ],
//             borderColor: ['#0d6efd', '#0dcaf0', '#dc3545'],
//             borderWidth: 1,
//             borderRadius: 10,
//             barThickness: 35,
//         }]
//     };

//     const config = {
//         type: 'bar',
//         data: data,
//         options: {
//             responsive: true,
//             maintainAspectRatio: false,
//             indexAxis: 'y', 
//             plugins: {
//                 legend: { display: false },
//                 tooltip: {
//                     backgroundColor: 'rgba(0, 0, 0, 0.7)',
//                     padding: 10,
//                     callbacks: {
//                         label: function(context) {
//                             return ` ${context.raw} 명 배정됨`;
//                         }
//                     }
//                 }
//             },
//             scales: {
//                 x: {
//                     beginAtZero: true,
//                     grid: { display: false },
//                     ticks: { font: { size: 11 } }
//                 },
//                 y: {
//                     grid: { display: false },
//                     ticks: { font: { weight: 'bold' } }
//                 }
//             },
//             animation: {
//                 duration: 1500,
//                 easing: 'easeOutQuart'
//             }
//         }
//     };

//     manningChart = new Chart(ctx, config);
// }


// function initEventListeners() {
//     const hourInputs = document.querySelectorAll('.hour-input');
    
//     hourInputs.forEach(input => {
//         input.addEventListener('change', function() {
//             console.log(`Manning ID ${this.dataset.manningId}의 시간이 ${this.value}로 변경됨`);
//             updateManningStats();
//         });
//     });
// }


// function updateManningStats() {
//     if (!manningChart) return;
//     manningChart.update();
// }