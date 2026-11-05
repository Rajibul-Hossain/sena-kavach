#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// Set the LCD address to 0x27 or 0x3F based on your module
LiquidCrystal_I2C lcd(0x27, 16, 2); 

void setup() {
  Serial.begin(9600);
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Sena Kavach Rx");
  delay(2000);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Msg: ");
}

void loop() {
  if (Serial.available() > 0) {
    // Reads the raw character directly sent by Python
    char rawData = Serial.read();
    
    lcd.print(rawData);
    
    // Basic screen wrap
    static int cursorCol = 5; 
    cursorCol++;
    
    if (cursorCol > 15) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Msg: ");
      cursorCol = 5;
    }
  }
}