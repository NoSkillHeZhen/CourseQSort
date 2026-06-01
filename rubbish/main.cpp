#include "Calculator.h"
#include <conio.h>
using namespace std;

// Compile under c++17 or higher

void clearInput(){
    char c;
    while ((c = getchar()) != '\n') {}
}

void refresh(){
    cout << "Please press Enter to refresh the calculator" << '\n';
    clearInput();
    clearInput();
}

int main(){
    //ios::sync_with_stdio(0); cin.tie(0); cout.tie(0);
    cout << "-------------------------------------" << '\n';
    cout << "Please press key to select mode" << '\n' 
    << "R: Regular calculator" << '\n'
    << "P: Polynomial calculator" << '\n'
    << "#: Terminate calculator" << '\n';
    cout << "-------------------------------------" << '\n';
    char mode = getch();
    Calculator<int> calR; // Regular calculator
    Calculator<Polynomial> calP; // Polynomial calculator
    Polynomial polyA; // Store the polynomial A
    while (mode != '#'){
        char switchFlag = '\0';
        switch (mode){
        case 'R':
        case 'r':
            cout << "Mode selected: Regular calculator" << '\n';
            cout << "You can press \"S\" to switch the mode" << '\n';
            while (switchFlag != 'S' && switchFlag != 's'){
                cout << "-------------------------------------" << '\n';
                cout << "Input: ";
                switchFlag = getch();
                if (switchFlag == 'S' || switchFlag == 's'){
                    cout << "Mode switched!" << '\n';
                    cout << "-------------------------------------" << '\n';
                    switchFlag = '\0';
                    mode = 'P';
                    break;
                }
                else if (switchFlag == '#'){
                    switchFlag = '\0';
                    mode = '#';
                    break;
                }
                else {
                    cout << switchFlag;
                    ungetc(switchFlag, stdin);
                }
                try {
                    int ans = calR.run();
                    cout << "Output: " << ans << '\n';
                }
                catch (const invalid_argument &e) {
                    cerr << "Invalid input, caught " << e.what() << '\n';
                    refresh();
                }
                catch (const out_of_range &e){
                    cerr << "Stack stucked, caught " << e.what() << '\n';
                    refresh();
                }
                catch (const exception& e){
                    cerr << "Something went wrong, caught " << e.what() << '\n';
                    refresh();
                }
                cout << "-------------------------------------" << '\n';
            }
            break;
        case 'P':
        case 'p':
            cout << "Mode selected: Polynomial calculator" << '\n';
            cout << "You can press \"S\" to switch the mode" << '\n';
            cout << "-------------------------------------" << '\n';
            cout << "Choose mode:" << '\n'
            << "1: Input polynomial A, print A" << '\n'
            << "2: Input polynomial B, replace A to A + B and print" << '\n'
            << "3: Input polynomial B, replace A to A - B and print" << '\n'
            << "4: Input polynomial B, replace A to A * B and print" << '\n'
            << "5: Input x, print the value of A" << '\n'
            << "6: Replace A to the derivative of A and print" << '\n';
            cout << "-------------------------------------" << '\n';
            while (switchFlag != '#' && switchFlag != 'S' && switchFlag != 's'){
                double x = 0;
                switchFlag = getch();
                switch (switchFlag){
                case '1':
                    cout << "Input A: ";
                    try {
                        polyA = calP.run();
                        cout << "Output: A = ";
                        polyA.print();
                    }
                    catch (const invalid_argument &e) {
                        cerr << "Invalid input, caught " << e.what() << '\n';
                        refresh();
                    }
                    catch (const out_of_range &e){
                        cerr << "Stack stucked, caught " << e.what() << '\n';
                        refresh();
                    }
                    catch (const exception& e){
                        cerr << "Something went wrong, caught " << e.what() << '\n';
                        refresh();
                    }
                    break;
                case '2':
                case '3':
                case '4':
                    cout << "Input B: ";
                    try {
                        Polynomial polyB = calP.run();
                        if (switchFlag == '2'){
                            polyA = polyA + polyB;
                            cout << "Output: A + B = ";
                        }
                        else if (switchFlag == '3'){
                            polyA = polyA - polyB;
                            cout << "Output: A - B = ";
                        }
                        else {
                            polyA = polyA * polyB;
                            cout << "Output: A * B = ";
                        }
                        polyA.print();
                    }
                    catch (const invalid_argument &e) {
                        cerr << "Invalid input, caught " << e.what() << '\n';
                        refresh();
                    }
                    catch (const out_of_range &e){
                        cerr << "Stack stucked, caught " << e.what() << '\n';
                        refresh();
                    }
                    catch (const exception& e){
                        cerr << "Something went wrong, caught " << e.what() << '\n';
                        refresh();
                    }
                    break;
                case '5':
                    cout << "Input x: ";
                    cin >> x;
                    clearInput();
                    cout << "x = " << x << ", A = " << polyA.getValue(x) << '\n';
                    break;
                case '6':
                    cout << "Differentiate A to receive A' = ";
                    polyA.differentiate();
                    polyA.print();
                    break;
                case 'S':
                case 's':
                    cout << "Mode switched!" << '\n';
                    mode = 'R';
                    break;
                case '#':
                    mode = '#';
                    break;
                default:
                    break;
                }
                cout << "-------------------------------------" << '\n';
            }
            switchFlag = '\0';
            break;
        case '#':
            break;
        default:
            mode = getch();
            break;
        }
    }
    cout << "Terminating process..." << '\n';
    cout << "Success! ^^" << '\n';
    cout << "Press any key to continue..." << '\n';
    getch();
    return 0;
}
/*
There's a voice I hear inside my silence
Telling me that I can't let life
Just leave me dry
I gotta try
So I'll live with an open heart
And I'll show you every part
Every secret that I hold
Waiting to unfold
And as the shadows of yesterday
Begin to fall away
As I look at the rising sun
I know I have just begun
Just begun
--from Open Heart by Mazare / Keepsake / Liel Kolet
*/