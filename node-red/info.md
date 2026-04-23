====Wonderland Engine ARDI Library====

This library allows the use of ARDI live data in Wonderland Engine 3D/XR experiences.

===Using===

Add the **ARDIServer** behaviour to an object within the scene.

Set the appropriate server URL and site name.

Next, add an **ARDIBinding** behaviour on any objects inside the scene that you'd like to respond to live data. When new data arrives, it will be copied into a chosen Javascript property.

For example, a 3D text object might have the following binding...

TARGET: text
SOURCE: Paint Line.Speed - Actual
COMP: text

The _target_ is the property to be written to, the _source_ is the ARDI value to read from, and _comp_ is the name of the component you are writing to.

This means that the _value of the text_ is directly set by the _paint line speed_.

===Scaling/Conversion===

You can set the **mode** and the optional parameters (alpha, beta, gamma and delta) to alter exactly how the value is transferred to the property.

==copy: Pure Copy==

A mode of zero simply copies the data without other manipulation.

==scale: Scaling==

This scales the incoming value. x1 and y1 define how large you expect the _incoming_ data to be, while x2 and y2 are how large the _written_ value should be.

For example, an x1 of 0 and y1 of 100 along with a x2 of 0 and delta of y2 will scale a 0-100 value to a 0-1 value.

==text: Text==

This is designed to be used when copying the value to text objects.

The x1 value determines the number of decimal places to use. Ie. an x1 of 2 would give the value down to 2 decimal places.