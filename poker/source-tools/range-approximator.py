import sys
import numpy as np

# GTOWizard NL500 General Preflop Opening Ranges at various stack depths
trainingRanges = {
    40: [[46.2, 3.9], 42, 29.6, 24.1, 20.1],
    50: [[42.5, 6.5], 42, 29.7, 22, 18.1],
    75: [[32.7, 19.6], 42.2, 28.7, 22, 17.7],
    100: [[33.8, 17.8], 43.5, 29.3, 21.5, 17.6],
    150: [43, 46.5, 31.2, 23.8, 18.7],
    200: [43.6, 53.6, 32.3, 24.7, 19.1]
}

stackDepth = 0

if __name__ == "__main__":
    try:
        stackDepth = int(sys.argv[1])
    except:
        pass

print(np.fft.fft(trainingRanges[200]))
print(np.fft.ifft(np.fft.fft(trainingRanges[200])))