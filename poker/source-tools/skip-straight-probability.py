from hashlib import blake2b
from mmap import PROT_EXEC
import random

deck = []

def shuffleDeck():
    deck.clear()
    for card in ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"]:
        for i in range(4):
            deck.append(card)
    random.shuffle(deck)

def cardToInt(card):
    try:
        return int(card)
    except:
        return ["T", "J", "Q", "K", "A"].index(card) + 10

def intToCard(int):
    if int >= 10:
        return ["T", "J", "Q", "K", "A"][int - 10]
    else:
        return str(int)

def randomBoard(numCards):
    shuffleDeck()
    board = []
    for i in range(numCards):
        board += deck.pop()
    return board

def testStraight(board, skip = 1, straightLength = 5):
    intBoard = [cardToInt(card) for card in board]
    for card in intBoard:
        if card == 14:
            intBoard.append(1)
    intBoard.sort()
    testCard = intBoard[-1]
    while straightLength > 1:
        if (testCard - skip in intBoard):
            testCard -= skip
            straightLength -= 1
        else:
            return None
    return intToCard(testCard) + " high straight"

for i in range(1, 14):
    numTrials = 5000
    numSuccessful = 0
    for j in range(numTrials):
        output = testStraight(randomBoard(i), 3, 5)
        if output != None:
            numSuccessful += 1
    print(str(i) + ": " + str(numSuccessful / numTrials))
