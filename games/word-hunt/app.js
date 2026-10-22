const messageWords = [
    "WILL",
    "YOU",
    "VALENTINE"
];
const boardSize = 4;
var board = []
for (var i = 0; i < boardSize; i++) {
    board.push([]);
    for (var j = 0; j < boardSize; j++) {
        board[i].push('');
    }
}
console.log(board);