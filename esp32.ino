const int micPin = 34;  // 麥克風
#define X_PIN 35
#define Y_PIN 32
#define Z_PIN 33

void setup() {
  Serial.begin(115200);

  analogReadResolution(12);        // 0–4095
  analogSetPinAttenuation(micPin, ADC_11db);
}

void loop() {
  int micRaw = analogRead(micPin);
  float micV = micRaw * (3.3 / 4095.0);

  int xRaw = analogRead(X_PIN);
  int yRaw = analogRead(Y_PIN);
  int zRaw = analogRead(Z_PIN);

  // 輸出格式：micV,x,y,z
  Serial.print(micV, 3);
  Serial.print(",");
  Serial.print(xRaw);
  Serial.print(",");
  Serial.print(yRaw);
  Serial.print(",");
  Serial.println(zRaw);

  delay(5);   // ADXL 建議快一點
}
